"""Wallet endpoints — list, detail, analyze, review, export."""

import asyncio
import csv
import io
import logging
from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, Query, HTTPException
from fastapi.responses import StreamingResponse

from app.database import execute_query, get_scylla_session
from app.schemas.wallet import (
    WalletResponse, WalletListResponse,
    AnalyzeRequest, BulkAnalyzeRequest,
    ReviewRequest, ChainEnum,
    WalletActivityResponse, WalletActivityTransaction, WalletActivityTokenTransfer,
    DashboardSeedResponse, DashboardSeedWallet,
)
from app.services.classifier import classify_wallet
from app.services.rpc import get_address_info, get_block_by_number, get_latest_block_number

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/wallets", tags=["wallets"])


def _freq_tier_from_count(tx_count: int) -> str:
    if tx_count == 0:
        return "F1"
    if tx_count <= 3:
        return "F2"
    if tx_count <= 10:
        return "F3"
    if tx_count <= 19:
        return "F4"
    return "F5"


def _freq_cycle_from_count(tx_count: int) -> str:
    if tx_count >= 1000:
        return "D"
    if tx_count >= 100:
        return "W"
    if tx_count >= 10:
        return "M"
    return "Y"


def _review_from_count(tx_count: int) -> str:
    return "A" if tx_count >= 20 else "M"


@router.get("/recent-dashboard", response_model=DashboardSeedResponse)
async def recent_dashboard_wallets(
    chain: ChainEnum = Query(ChainEnum.eth),
    limit: int = Query(10000, ge=1, le=10000),
    max_blocks: int = Query(500, ge=1, le=5000),
):
    """Build dashboard seed rows from the latest unique addresses seen on the node."""
    if chain != ChainEnum.eth:
        raise HTTPException(status_code=400, detail="recent-dashboard currently supports eth only")

    try:
        latest_block = await get_latest_block_number(chain.value)
    except Exception as exc:
        logger.exception("recent-dashboard failed to reach the ETH RPC")
        raise HTTPException(status_code=502, detail=f"ETH RPC unavailable: {exc}") from exc

    collected: dict[str, dict] = {}
    blocks_scanned = 0
    batch_size = 10
    current_block = latest_block

    while len(collected) < limit and blocks_scanned < max_blocks and current_block >= 0:
        batch_numbers = []
        remaining = min(batch_size, max_blocks - blocks_scanned)
        for offset in range(remaining):
            block_num = current_block - offset
            if block_num < 0:
                break
            batch_numbers.append(block_num)

        if not batch_numbers:
            break

        blocks = await asyncio.gather(
            *[get_block_by_number(chain.value, block_num, full_tx=True) for block_num in batch_numbers],
            return_exceptions=True,
        )

        for block in blocks:
            if len(collected) >= limit:
                break
            blocks_scanned += 1

            if isinstance(block, Exception) or not block:
                continue

            block_num = int(block["number"], 16)
            block_ts = datetime.fromtimestamp(int(block["timestamp"], 16), tz=timezone.utc)

            for tx in block.get("transactions", []):
                if not isinstance(tx, dict):
                    continue

                from_addr = (tx.get("from") or "").lower()
                to_addr = (tx.get("to") or "").lower()

                if from_addr:
                    row = collected.get(from_addr)
                    if row is None and len(collected) < limit:
                        row = {
                            "address": from_addr,
                            "txCount": 0,
                            "fundedBy": None,
                            "createdAt": block_ts.date().isoformat(),
                            "lastSeen": block_num,
                        }
                        collected[from_addr] = row
                    if row is not None:
                        row["txCount"] += 1
                        row["createdAt"] = min(row["createdAt"], block_ts.date().isoformat())
                        row["lastSeen"] = max(row["lastSeen"], block_num)

                if to_addr:
                    row = collected.get(to_addr)
                    if row is None and len(collected) < limit:
                        row = {
                            "address": to_addr,
                            "txCount": 0,
                            "fundedBy": from_addr or None,
                            "createdAt": block_ts.date().isoformat(),
                            "lastSeen": block_num,
                        }
                        collected[to_addr] = row
                    if row is not None:
                        row["txCount"] += 1
                        row["createdAt"] = min(row["createdAt"], block_ts.date().isoformat())
                        row["lastSeen"] = max(row["lastSeen"], block_num)
                        if from_addr and (row.get("fundedBy") is None or row["createdAt"] == block_ts.date().isoformat()):
                            row["fundedBy"] = from_addr

        current_block = batch_numbers[-1] - 1

    sorted_rows = sorted(
        collected.values(),
        key=lambda row: (-row["lastSeen"], row["address"]),
    )[:limit]

    wallets = [
        DashboardSeedWallet(
            id=index + 1,
            address=row["address"],
            balance="0",
            txCount=row["txCount"],
            fundedBy=row.get("fundedBy"),
            createdAt=row["createdAt"],
            dataSource="R",
            clientType="U",
            clientTier="L1",
            review=_review_from_count(row["txCount"]),
            freqCycle=_freq_cycle_from_count(row["txCount"]),
            freqTier=_freq_tier_from_count(row["txCount"]),
            addressPurity="C",
        )
        for index, row in enumerate(sorted_rows)
    ]

    return DashboardSeedResponse(
        chain=chain.value,
        latest_block=latest_block,
        blocks_scanned=blocks_scanned,
        addresses_collected=len(wallets),
        wallets=wallets,
    )


@router.get("", response_model=WalletListResponse)
async def list_wallets(
    chain: ChainEnum = Query(ChainEnum.eth),
    wallet_type: Optional[str] = None,
    wallet_tier: Optional[str] = None,
    min_tx: Optional[int] = None,
    sort_by: str = Query("updated_at", pattern="^(updated_at|tx_count|risk_score)$"),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=500),
):
    """List wallets with filters, pagination, sorting."""
    # Use wallets_by_time for time-sorted listing
    rows = execute_query(
        "SELECT * FROM wallets_by_time WHERE chain = %s LIMIT %s",
        (chain.value, page_size * page),
        page_size=page_size,
    )

    # Apply filters in-memory (ScyllaDB secondary indexes for ALLOW FILTERING)
    wallets = []
    for r in rows:
        if wallet_type and r.get("wallet_type") != wallet_type:
            continue
        if wallet_tier and r.get("wallet_tier") != wallet_tier:
            continue
        if min_tx and (r.get("tx_count") or 0) < min_tx:
            continue
        wallets.append(r)

    # Paginate
    start = (page - 1) * page_size
    end = start + page_size
    page_wallets = wallets[start:end]

    return WalletListResponse(
        wallets=[_row_to_wallet(chain.value, w) for w in page_wallets],
        total=len(wallets),
        page=page,
        page_size=page_size,
    )


@router.get("/export")
async def export_wallets(
    chain: ChainEnum = Query(ChainEnum.eth),
    format: str = Query("csv"),
):
    """Export wallets as CSV."""
    rows = execute_query(
        "SELECT * FROM wallets_by_time WHERE chain = %s LIMIT 10000",
        (chain.value,),
        page_size=1000,
    )

    output = io.StringIO()
    writer = csv.DictWriter(output, fieldnames=[
        "address", "wallet_type", "wallet_tier", "risk_score",
        "tx_count", "first_seen", "last_seen", "tags",
    ])
    writer.writeheader()
    for r in rows:
        writer.writerow({
            "address": r.get("address", ""),
            "wallet_type": r.get("wallet_type", ""),
            "wallet_tier": r.get("wallet_tier", ""),
            "risk_score": r.get("risk_score", 0),
            "tx_count": r.get("tx_count", 0),
            "first_seen": r.get("first_seen", ""),
            "last_seen": r.get("last_seen", ""),
            "tags": ",".join(r.get("tags") or []),
        })
    output.seek(0)
    return StreamingResponse(
        output,
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={chain.value}_wallets.csv"},
    )


@router.get("/{address}", response_model=WalletResponse)
async def get_wallet(
    address: str,
    chain: ChainEnum = Query(ChainEnum.eth),
):
    """Get wallet detail."""
    address = address.lower()
    rows = execute_query(
        "SELECT * FROM wallets WHERE chain = %s AND address = %s",
        (chain.value, address),
    )
    if not rows:
        raise HTTPException(status_code=404, detail="Wallet not found")
    return _row_to_wallet(chain.value, rows[0])


@router.get("/{address}/activity", response_model=WalletActivityResponse)
async def get_wallet_activity(
    address: str,
    chain: ChainEnum = Query(ChainEnum.eth),
    limit: int = Query(25, ge=1, le=200),
):
    """Get recent wallet activity indexed from the node."""
    address = address.lower()
    chain_value = chain.value

    wallet_rows = execute_query(
        "SELECT * FROM wallets WHERE chain = %s AND address = %s",
        (chain_value, address),
    )
    tx_rows = execute_query(
        """SELECT block_number, tx_hash, from_address, to_address, value, gas_price,
           gas_used, status, timestamp, method_id
           FROM transactions_by_address
           WHERE chain = %s AND address = %s
           LIMIT %s""",
        (chain_value, address, limit),
        page_size=limit,
    )
    token_rows = execute_query(
        """SELECT block_number, tx_hash, token_address, from_address, to_address,
           value, token_symbol, token_decimals, timestamp
           FROM token_transfers
           WHERE chain = %s AND address = %s
           LIMIT %s""",
        (chain_value, address, limit),
        page_size=limit,
    )
    state_rows = execute_query(
        "SELECT * FROM indexer_state WHERE chain = %s",
        (chain_value,),
    )

    wallet_row = wallet_rows[0] if wallet_rows else {}
    state_row = state_rows[0] if state_rows else {}

    return WalletActivityResponse(
        chain=chain_value,
        address=address,
        tx_count=int(wallet_row.get("tx_count") or len(tx_rows)),
        token_transfer_total=len(token_rows),
        last_indexed_block=int(state_row.get("last_block") or 0),
        indexer_status=state_row.get("status", "unknown") or "unknown",
        eth_price="0",
        transactions=[
            WalletActivityTransaction(
                tx_hash=row.get("tx_hash", ""),
                from_address=row.get("from_address"),
                to_address=row.get("to_address"),
                value=str(row.get("value", 0) or 0),
                gas_price=str(row.get("gas_price", 0) or 0),
                gas_used=str(row.get("gas_used", 0) or 0),
                status=int(row.get("status", 0) or 0),
                block_number=int(row.get("block_number", 0) or 0),
                timestamp=row.get("timestamp"),
                method_id=row.get("method_id"),
            )
            for row in tx_rows
        ],
        token_transfers=[
            WalletActivityTokenTransfer(
                tx_hash=row.get("tx_hash", ""),
                token_address=row.get("token_address"),
                token_symbol=row.get("token_symbol"),
                token_decimals=int(row.get("token_decimals", 0) or 0),
                from_address=row.get("from_address"),
                to_address=row.get("to_address"),
                value=str(row.get("value", 0) or 0),
                block_number=int(row.get("block_number", 0) or 0),
                timestamp=row.get("timestamp"),
            )
            for row in token_rows
        ],
        last_seen=wallet_row.get("last_seen"),
        updated_at=wallet_row.get("updated_at"),
    )


CACHE_TTL_SECONDS = 300  # re-analyze after 5 minutes


@router.post("/analyze", response_model=WalletResponse)
async def analyze_wallet(req: AnalyzeRequest):
    """Analyze a single address — check DB cache first, then fetch on-chain."""
    address = req.address.lower()
    chain = req.chain.value

    # Return cached result if analyzed recently (within TTL)
    existing = execute_query(
        "SELECT * FROM wallets WHERE chain = %s AND address = %s",
        (chain, address),
    )
    if existing:
        row = existing[0]
        updated_at = row.get("updated_at")
        if updated_at:
            ts = updated_at if updated_at.tzinfo else updated_at.replace(tzinfo=timezone.utc)
            age = (datetime.now(timezone.utc) - ts).total_seconds()
            if age < CACHE_TTL_SECONDS:
                return _row_to_wallet(chain, row)

    # Fetch on-chain info
    info = await get_address_info(chain, address)
    if not info:
        raise HTTPException(status_code=400, detail="Could not fetch address info")

    # Classify
    classification = classify_wallet(info)

    # Upsert into wallets table
    now = datetime.now(timezone.utc)
    session = get_scylla_session()
    session.execute(
        """INSERT INTO wallets (chain, address, first_seen, last_seen,
           tx_count, tx_in_count, tx_out_count, wallet_type, wallet_tier,
           risk_score, confidence, is_contract, tags, reviewed, updated_at)
           VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)""",
        (
            chain, address,
            info.get("first_seen"), info.get("last_seen"),
            info.get("tx_count", 0), info.get("tx_in_count", 0), info.get("tx_out_count", 0),
            classification["wallet_type"], classification["wallet_tier"],
            classification["risk_score"], classification["confidence"],
            info.get("is_contract", False),
            set(classification.get("tags", [])),
            False, now,
        ),
    )

    # Also upsert wallets_by_time
    session.execute(
        """INSERT INTO wallets_by_time (chain, updated_at, address,
           wallet_type, wallet_tier, risk_score, tx_count, first_seen, last_seen, tags)
           VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)""",
        (
            chain, now, address,
            classification["wallet_type"], classification["wallet_tier"],
            classification["risk_score"], info.get("tx_count", 0),
            info.get("first_seen"), info.get("last_seen"),
            set(classification.get("tags", [])),
        ),
    )

    rows = execute_query(
        "SELECT * FROM wallets WHERE chain = %s AND address = %s",
        (chain, address),
    )
    return _row_to_wallet(chain, rows[0])


@router.post("/bulk-analyze")
async def bulk_analyze(req: BulkAnalyzeRequest):
    """Analyze multiple addresses in parallel."""
    async def _analyze_one(addr: str):
        try:
            return await analyze_wallet(AnalyzeRequest(chain=req.chain, address=addr))
        except Exception as e:
            logger.warning(f"Failed to analyze {addr}: {e}")
            return {"address": addr, "error": str(e)}

    results = await asyncio.gather(*[_analyze_one(addr) for addr in req.addresses])
    return {"analyzed": len(results), "results": list(results)}


@router.put("/{address}/review", response_model=WalletResponse)
async def review_wallet(
    address: str,
    req: ReviewRequest,
    chain: ChainEnum = Query(ChainEnum.eth),
):
    """Manual review override."""
    address = address.lower()
    now = datetime.now(timezone.utc)
    session = get_scylla_session()

    # Check exists
    rows = execute_query(
        "SELECT * FROM wallets WHERE chain = %s AND address = %s",
        (chain.value, address),
    )
    if not rows:
        raise HTTPException(status_code=404, detail="Wallet not found")

    updates = []
    params = []
    if req.wallet_type is not None:
        updates.append("wallet_type = %s")
        params.append(req.wallet_type.value)
    if req.wallet_tier is not None:
        updates.append("wallet_tier = %s")
        params.append(req.wallet_tier.value)
    if req.risk_score is not None:
        updates.append("risk_score = %s")
        params.append(req.risk_score)
    if req.tags is not None:
        updates.append("tags = %s")
        params.append(set(req.tags))
    if req.review_notes is not None:
        updates.append("review_notes = %s")
        params.append(req.review_notes)

    updates.extend(["reviewed = %s", "reviewed_by = %s", "reviewed_at = %s", "updated_at = %s"])
    params.extend([True, req.reviewed_by, now, now])
    params.extend([chain.value, address])

    session.execute(
        f"UPDATE wallets SET {', '.join(updates)} WHERE chain = %s AND address = %s",
        tuple(params),
    )

    rows = execute_query(
        "SELECT * FROM wallets WHERE chain = %s AND address = %s",
        (chain.value, address),
    )
    return _row_to_wallet(chain.value, rows[0])


def _row_to_wallet(chain: str, row: dict) -> WalletResponse:
    """Convert ScyllaDB row to WalletResponse."""
    return WalletResponse(
        chain=chain,
        address=row.get("address", ""),
        first_seen=row.get("first_seen"),
        last_seen=row.get("last_seen"),
        tx_count=row.get("tx_count", 0) or 0,
        tx_in_count=row.get("tx_in_count", 0) or 0,
        tx_out_count=row.get("tx_out_count", 0) or 0,
        total_value_in=str(row.get("total_value_in", 0) or 0),
        total_value_out=str(row.get("total_value_out", 0) or 0),
        token_count=row.get("token_count", 0) or 0,
        unique_interactions=row.get("unique_interactions", 0) or 0,
        gas_spent=str(row.get("gas_spent", 0) or 0),
        wallet_type=row.get("wallet_type", "unknown"),
        wallet_tier=row.get("wallet_tier"),
        risk_score=row.get("risk_score", 0.0) or 0.0,
        confidence=row.get("confidence", 0.0) or 0.0,
        is_contract=row.get("is_contract", False) or False,
        tags=list(row.get("tags") or []),
        reviewed=row.get("reviewed", False) or False,
        reviewed_by=row.get("reviewed_by"),
        reviewed_at=row.get("reviewed_at"),
        review_notes=row.get("review_notes"),
        updated_at=row.get("updated_at"),
    )
