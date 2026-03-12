"""Block indexer — subscribes to new blocks and indexes transactions.

Run standalone: python -m app.services.indexer
"""

import asyncio
import logging
import signal
import sys
from datetime import datetime, timezone

from app.config import settings
from app.database import get_scylla_session, execute_query
from app.chains import CHAINS, ENABLED_CHAINS
from app.services.rpc import (
    get_latest_block_number, get_block_by_number,
    get_block_receipts, get_logs,
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(name)s] %(levelname)s: %(message)s")
logger = logging.getLogger("indexer")

# ERC-20 Transfer event
TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef"

_running = True


def _stop(*args):
    global _running
    logger.info("Shutting down indexer...")
    _running = False


signal.signal(signal.SIGINT, _stop)
signal.signal(signal.SIGTERM, _stop)


async def get_last_indexed_block(chain: str) -> int:
    """Get last indexed block from indexer_state."""
    rows = execute_query(
        "SELECT last_block FROM indexer_state WHERE chain = %s", (chain,)
    )
    if rows and rows[0].get("last_block"):
        return rows[0]["last_block"]
    return 0


def update_indexer_state(chain: str, block_num: int, status: str = "syncing", error: str = None):
    """Update indexer state."""
    session = get_scylla_session()
    session.execute(
        """INSERT INTO indexer_state (chain, last_block, updated_at, status, error_message)
           VALUES (%s, %s, %s, %s, %s)""",
        (chain, block_num, datetime.now(timezone.utc), status, error),
    )


def index_block(chain: str, block: dict, receipts: list = None):
    """Index a single block and its transactions into ScyllaDB."""
    session = get_scylla_session()
    block_num = int(block["number"], 16)
    block_ts = datetime.fromtimestamp(int(block["timestamp"], 16), tz=timezone.utc)
    txs = block.get("transactions", [])

    # Insert block
    session.execute(
        """INSERT INTO blocks (chain, block_number, block_hash, parent_hash,
           timestamp, tx_count, gas_used, gas_limit, base_fee)
           VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)""",
        (
            chain, block_num, block["hash"], block["parentHash"],
            block_ts, len(txs),
            int(block.get("gasUsed", "0x0"), 16),
            int(block.get("gasLimit", "0x0"), 16),
            int(block.get("baseFeePerGas", "0x0"), 16) if block.get("baseFeePerGas") else 0,
        ),
    )

    # Build receipt lookup
    receipt_map = {}
    if receipts:
        for r in receipts:
            receipt_map[r["transactionHash"].lower()] = r

    # Index transactions
    for i, tx in enumerate(txs):
        if isinstance(tx, str):
            continue  # skip if block was fetched without full tx

        tx_hash = tx["hash"].lower()
        from_addr = (tx.get("from") or "").lower()
        to_addr = (tx.get("to") or "").lower()
        value = int(tx.get("value", "0x0"), 16)
        gas_price = int(tx.get("gasPrice", "0x0"), 16)
        input_data = tx.get("input", "0x")
        method_id = input_data[:10] if len(input_data) >= 10 else ""

        receipt = receipt_map.get(tx_hash, {})
        gas_used = int(receipt.get("gasUsed", "0x0"), 16) if receipt else 0
        status = int(receipt.get("status", "0x1"), 16) if receipt else 1

        # Insert into transactions_by_hash
        session.execute(
            """INSERT INTO transactions_by_hash
               (chain, tx_hash, block_number, tx_index, from_address, to_address,
                value, gas_price, gas_used, input_data, status, timestamp, method_id)
               VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)""",
            (
                chain, tx_hash, block_num, i, from_addr, to_addr,
                value, gas_price, gas_used,
                method_id,  # store only method_id to save space
                status, block_ts, method_id,
            ),
        )

        # Insert into transactions_by_address (for sender)
        if from_addr:
            session.execute(
                """INSERT INTO transactions_by_address
                   (chain, address, block_number, tx_index, tx_hash, from_address,
                    to_address, value, gas_price, gas_used, input_data, status, timestamp, method_id)
                   VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)""",
                (
                    chain, from_addr, block_num, i, tx_hash, from_addr,
                    to_addr, value, gas_price, gas_used, method_id,
                    status, block_ts, method_id,
                ),
            )

        # Insert into transactions_by_address (for receiver)
        if to_addr and to_addr != from_addr:
            session.execute(
                """INSERT INTO transactions_by_address
                   (chain, address, block_number, tx_index, tx_hash, from_address,
                    to_address, value, gas_price, gas_used, input_data, status, timestamp, method_id)
                   VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)""",
                (
                    chain, to_addr, block_num, i, tx_hash, from_addr,
                    to_addr, value, gas_price, gas_used, method_id,
                    status, block_ts, method_id,
                ),
            )

        # Parse ERC-20 Transfer logs from receipt
        if receipt:
            for log_idx, log in enumerate(receipt.get("logs", [])):
                topics = log.get("topics", [])
                if len(topics) >= 3 and topics[0].lower() == TRANSFER_TOPIC:
                    token_addr = log["address"].lower()
                    log_from = "0x" + topics[1][-40:]
                    log_to = "0x" + topics[2][-40:]
                    log_value = int(log.get("data", "0x0"), 16)
                    actual_log_index = int(log.get("logIndex", hex(log_idx)), 16)

                    # Insert for sender
                    _insert_token_transfer(
                        session, chain, log_from, block_num, actual_log_index,
                        tx_hash, token_addr, log_from, log_to, log_value, block_ts,
                    )
                    # Insert for receiver
                    if log_to != log_from:
                        _insert_token_transfer(
                            session, chain, log_to, block_num, actual_log_index,
                            tx_hash, token_addr, log_from, log_to, log_value, block_ts,
                        )


def _insert_token_transfer(session, chain, address, block_num, log_index,
                           tx_hash, token_addr, from_addr, to_addr, value, ts):
    session.execute(
        """INSERT INTO token_transfers
           (chain, address, block_number, log_index, tx_hash,
            token_address, from_address, to_address, value, timestamp)
           VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)""",
        (chain, address, block_num, log_index, tx_hash,
         token_addr, from_addr, to_addr, value, ts),
    )


async def index_chain(chain: str):
    """Index loop for a single EVM chain."""
    cfg = CHAINS.get(chain)
    if not cfg or not cfg.rpc_http:
        logger.warning(f"Skipping {chain}: no RPC configured")
        return

    if not cfg.is_evm:
        logger.info(f"Skipping {chain}: non-EVM indexing not yet implemented")
        return

    last_block = await get_last_indexed_block(chain)
    logger.info(f"[{chain}] Starting indexer from block {last_block}")

    while _running:
        try:
            latest = await get_latest_block_number(chain)

            if last_block >= latest:
                await asyncio.sleep(settings.indexer_poll_interval)
                continue

            # Index in batches
            target = min(last_block + settings.indexer_batch_size, latest)

            for block_num in range(last_block + 1, target + 1):
                if not _running:
                    break

                block = await get_block_by_number(chain, block_num, full_tx=True)
                if not block:
                    continue

                receipts = await get_block_receipts(chain, block_num)
                index_block(chain, block, receipts)

                if block_num % 100 == 0:
                    logger.info(f"[{chain}] Indexed block {block_num} / {latest}")

            last_block = target
            update_indexer_state(chain, last_block, "syncing")

        except Exception as e:
            logger.error(f"[{chain}] Indexer error: {e}")
            update_indexer_state(chain, last_block, "error", str(e))
            await asyncio.sleep(5)

    update_indexer_state(chain, last_block, "idle")
    logger.info(f"[{chain}] Indexer stopped at block {last_block}")


async def main():
    """Run indexers for all enabled chains concurrently."""
    logger.info(f"Starting indexer for chains: {ENABLED_CHAINS}")

    # Init ScyllaDB connection
    get_scylla_session()

    tasks = []
    for chain in ENABLED_CHAINS:
        if chain in CHAINS:
            tasks.append(asyncio.create_task(index_chain(chain)))
        else:
            logger.warning(f"Unknown chain: {chain}")

    if tasks:
        await asyncio.gather(*tasks)

    logger.info("All indexers stopped.")


if __name__ == "__main__":
    asyncio.run(main())
