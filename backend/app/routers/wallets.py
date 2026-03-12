"""Wallet endpoints — list, detail, analyze, review, export."""

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
)
from app.services.classifier import classify_wallet
from app.services.rpc import get_address_info

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/wallets", tags=["wallets"])


@router.get("", response_model=WalletListResponse)
async def list_wallets(
    chain: ChainEnum = Query(ChainEnum.eth),
    wallet_type: Optional[str] = None,
    wallet_tier: Optional[str] = None,
    min_tx: Optional[int] = None,
    sort_by: str = Query("updated_at", regex="^(updated_at|tx_count|risk_score)$"),
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


@router.post("/analyze", response_model=WalletResponse)
async def analyze_wallet(req: AnalyzeRequest):
    """Analyze a single address — fetch on-chain data + classify."""
    address = req.address.lower()
    chain = req.chain.value

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
    """Analyze multiple addresses."""
    results = []
    for addr in req.addresses:
        try:
            single = AnalyzeRequest(chain=req.chain, address=addr)
            result = await analyze_wallet(single)
            results.append(result)
        except Exception as e:
            logger.warning(f"Failed to analyze {addr}: {e}")
            results.append({"address": addr, "error": str(e)})
    return {"analyzed": len(results), "results": results}


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
