"""Label endpoints — manage known address labels."""

import logging
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException, Query

from app.database import execute_query, get_scylla_session
from app.schemas.wallet import LabelResponse, LabelCreateRequest, ChainEnum

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/labels", tags=["labels"])


@router.get("", response_model=list[LabelResponse])
async def list_labels(
    category: str = None,
    limit: int = Query(100, ge=1, le=1000),
):
    """List known labels."""
    if category:
        rows = execute_query(
            "SELECT * FROM labels WHERE category = %s LIMIT %s ALLOW FILTERING",
            (category, limit),
        )
    else:
        rows = execute_query("SELECT * FROM labels LIMIT %s", (limit,))

    return [
        LabelResponse(
            address=r["address"],
            chain=r.get("chain", ""),
            label=r.get("label", ""),
            category=r.get("category"),
            source=r.get("source"),
            added_at=r.get("added_at"),
        )
        for r in rows
    ]


@router.post("", response_model=LabelResponse)
async def add_label(req: LabelCreateRequest):
    """Add a known label."""
    session = get_scylla_session()
    now = datetime.now(timezone.utc)
    address = req.address.lower()

    session.execute(
        """INSERT INTO labels (address, chain, label, category, source, added_at, added_by)
           VALUES (%s, %s, %s, %s, %s, %s, %s)""",
        (address, req.chain.value, req.label, req.category, req.source, now, "api"),
    )

    return LabelResponse(
        address=address,
        chain=req.chain.value,
        label=req.label,
        category=req.category,
        source=req.source,
        added_at=now,
    )


@router.delete("/{address}")
async def remove_label(
    address: str,
    chain: ChainEnum = Query(ChainEnum.eth),
):
    """Remove a known label."""
    address = address.lower()
    session = get_scylla_session()

    rows = execute_query(
        "SELECT * FROM labels WHERE address = %s AND chain = %s",
        (address, chain.value),
    )
    if not rows:
        raise HTTPException(status_code=404, detail="Label not found")

    session.execute(
        "DELETE FROM labels WHERE address = %s AND chain = %s",
        (address, chain.value),
    )
    return {"deleted": True, "address": address, "chain": chain.value}
