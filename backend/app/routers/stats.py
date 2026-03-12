"""Stats + health endpoints."""

import logging
from fastapi import APIRouter, Query

from app.database import execute_query, get_scylla_session, get_redis
from app.schemas.wallet import StatsResponse, HealthResponse, ChainEnum
from app.chains import CHAINS

logger = logging.getLogger(__name__)
router = APIRouter(tags=["stats"])


@router.get("/api/stats", response_model=StatsResponse)
async def get_stats(chain: ChainEnum = Query(ChainEnum.eth)):
    """Dashboard statistics for a chain."""
    c = chain.value

    # Wallet counts by type
    type_rows = execute_query(
        "SELECT wallet_type, count(*) as cnt FROM wallets WHERE chain = %s "
        "GROUP BY chain ALLOW FILTERING",
        (c,),
    )

    # Get indexer state
    state_rows = execute_query(
        "SELECT * FROM indexer_state WHERE chain = %s", (c,)
    )
    state = state_rows[0] if state_rows else {}

    # Count wallets (approximate)
    wallet_rows = execute_query(
        "SELECT count(*) as cnt FROM wallets_by_time WHERE chain = %s", (c,)
    )
    total_wallets = wallet_rows[0]["cnt"] if wallet_rows else 0

    return StatsResponse(
        chain=c,
        total_wallets=total_wallets,
        last_indexed_block=state.get("last_block", 0) or 0,
        indexer_status=state.get("status", "unknown"),
    )


@router.get("/api/health", response_model=HealthResponse)
async def health_check():
    """Health check for all services."""
    result = HealthResponse(status="ok")

    # ScyllaDB
    try:
        get_scylla_session()
        result.scylla = "connected"
    except Exception as e:
        result.scylla = f"error: {e}"
        result.status = "degraded"

    # Redis
    try:
        r = await get_redis()
        await r.ping()
        result.redis = "connected"
    except Exception as e:
        result.redis = f"error: {e}"
        result.status = "degraded"

    # Chain endpoints
    chains_status = {}
    for name, cfg in CHAINS.items():
        chains_status[name] = {
            "rpc_configured": bool(cfg.rpc_http),
            "chain_id": cfg.chain_id,
        }
    result.chains = chains_status

    return result
