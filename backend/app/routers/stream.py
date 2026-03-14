"""SSE streaming endpoints — real-time block and transaction feed from the node."""

import asyncio
import json
import logging
from fastapi import APIRouter, Query
from fastapi.responses import StreamingResponse

from app.schemas.wallet import ChainEnum
from app.services.rpc import get_latest_block_number, get_block_by_number

logger = logging.getLogger(__name__)
router = APIRouter(tags=["stream"])


@router.get("/api/stream/blocks")
async def stream_blocks(
    chain: ChainEnum = Query(ChainEnum.eth),
    poll_interval: int = Query(3, ge=1, le=30),
):
    """SSE endpoint — streams new blocks and their transactions from the node in real-time."""

    async def event_generator():
        try:
            last_block = await get_latest_block_number(chain.value)
        except Exception as exc:
            yield f"data: {json.dumps({'error': str(exc)})}\n\n"
            return

        while True:
            try:
                latest = await get_latest_block_number(chain.value)

                if latest > last_block:
                    for block_num in range(last_block + 1, latest + 1):
                        block = await get_block_by_number(chain.value, block_num, full_tx=True)
                        if not block:
                            continue

                        txs = block.get("transactions", [])
                        payload = {
                            "blockNumber": int(block["number"], 16),
                            "blockHash": block.get("hash", ""),
                            "timestamp": int(block["timestamp"], 16),
                            "txCount": len(txs),
                            "gasUsed": int(block.get("gasUsed", "0x0"), 16),
                            "baseFee": int(block.get("baseFeePerGas", "0x0"), 16) if block.get("baseFeePerGas") else 0,
                            "transactions": [
                                {
                                    "hash": tx.get("hash", ""),
                                    "from": tx.get("from", ""),
                                    "to": tx.get("to") or "",
                                    "value": str(int(tx.get("value", "0x0"), 16)),
                                    "methodId": (tx.get("input", "")[:10] if len(tx.get("input", "")) >= 10 else "0x"),
                                }
                                for tx in txs[:100]
                                if isinstance(tx, dict)
                            ],
                        }
                        yield f"data: {json.dumps(payload)}\n\n"

                    last_block = latest
                else:
                    # Send keep-alive so the connection stays open
                    yield ": keep-alive\n\n"

            except Exception as exc:
                logger.warning("stream_blocks error: %s", exc)
                yield ": keep-alive\n\n"

            await asyncio.sleep(poll_interval)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )
