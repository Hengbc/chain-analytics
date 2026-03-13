"""RPC client for EVM chains + Solana/BTC adapters."""

import logging
import httpx
from typing import Optional, Dict, Any
from datetime import datetime, timezone

from app.chains import CHAINS

logger = logging.getLogger(__name__)

_client = httpx.AsyncClient(timeout=30.0)
_rpc_id = 0


def _next_id() -> int:
    global _rpc_id
    _rpc_id += 1
    return _rpc_id


async def evm_rpc(chain: str, method: str, params: list = None) -> Any:
    """Call EVM JSON-RPC method."""
    cfg = CHAINS.get(chain)
    if not cfg or not cfg.rpc_http:
        raise ValueError(f"No RPC configured for {chain}")

    payload = {
        "jsonrpc": "2.0",
        "id": _next_id(),
        "method": method,
        "params": params or [],
    }
    resp = await _client.post(cfg.rpc_http, json=payload)
    data = resp.json()
    if "error" in data:
        raise RuntimeError(f"RPC error ({chain}): {data['error']}")
    return data.get("result")


async def get_latest_block_number(chain: str) -> int:
    """Get latest block number for an EVM chain."""
    result = await evm_rpc(chain, "eth_blockNumber")
    return int(result, 16)


async def get_block_by_number(chain: str, block_num: int, full_tx: bool = True) -> dict:
    """Get block with transactions."""
    hex_num = hex(block_num)
    return await evm_rpc(chain, "eth_getBlockByNumber", [hex_num, full_tx])


async def get_block_receipts(chain: str, block_num: int, tx_hashes: list = None) -> list:
    """Get all receipts for a block.

    Tries eth_getBlockReceipts first (Geth 1.13+/Erigon).
    Falls back to individual eth_getTransactionReceipt calls if needed.
    """
    hex_num = hex(block_num)
    try:
        receipts = await evm_rpc(chain, "eth_getBlockReceipts", [hex_num])
        if receipts:
            return receipts
    except Exception:
        pass

    # Fallback: fetch receipts individually (slower but universally supported)
    if not tx_hashes:
        return []
    import asyncio
    tasks = [get_transaction_receipt(chain, h) for h in tx_hashes]
    results = await asyncio.gather(*tasks, return_exceptions=True)
    return [r for r in results if isinstance(r, dict)]


async def get_transaction_receipt(chain: str, tx_hash: str) -> dict:
    """Get single transaction receipt."""
    return await evm_rpc(chain, "eth_getTransactionReceipt", [tx_hash])


async def get_code(chain: str, address: str) -> str:
    """Check if address is a contract."""
    return await evm_rpc(chain, "eth_getCode", [address, "latest"])


async def get_balance(chain: str, address: str) -> int:
    """Get native balance in wei."""
    result = await evm_rpc(chain, "eth_getBalance", [address, "latest"])
    return int(result, 16)


async def get_tx_count(chain: str, address: str) -> int:
    """Get nonce (outgoing tx count)."""
    result = await evm_rpc(chain, "eth_getTransactionCount", [address, "latest"])
    return int(result, 16)


async def get_logs(chain: str, from_block: int, to_block: int, topics: list = None) -> list:
    """Get event logs for a block range."""
    params = {
        "fromBlock": hex(from_block),
        "toBlock": hex(to_block),
    }
    if topics:
        params["topics"] = topics
    return await evm_rpc(chain, "eth_getLogs", [params]) or []


async def get_address_info(chain: str, address: str) -> Optional[Dict]:
    """Fetch comprehensive address info for classification."""
    cfg = CHAINS.get(chain)
    if not cfg:
        return None

    if cfg.is_evm:
        return await _get_evm_address_info(chain, address)
    elif chain == "solana":
        return await _get_solana_address_info(address)
    elif chain == "btc":
        return await _get_btc_address_info(address)
    return None


async def _get_evm_address_info(chain: str, address: str) -> Dict:
    """Gather EVM address info."""
    address = address.lower()
    try:
        balance, nonce, code = await _gather_evm(chain, address)
        is_contract = code != "0x" and len(code) > 2

        return {
            "chain": chain,
            "address": address,
            "balance": balance,
            "tx_count": nonce,
            "tx_in_count": 0,   # needs indexing to count
            "tx_out_count": nonce,
            "is_contract": is_contract,
            "code_size": len(code) // 2 if is_contract else 0,
            "first_seen": None,
            "last_seen": datetime.now(timezone.utc),
        }
    except Exception as e:
        logger.error(f"Error fetching EVM info for {address} on {chain}: {e}")
        return None


async def _gather_evm(chain: str, address: str):
    """Parallel fetch balance + nonce + code."""
    import asyncio
    balance_t = get_balance(chain, address)
    nonce_t = get_tx_count(chain, address)
    code_t = get_code(chain, address)
    return await asyncio.gather(balance_t, nonce_t, code_t)


async def _get_solana_address_info(address: str) -> Dict:
    """Fetch Solana account info."""
    cfg = CHAINS["solana"]
    if not cfg.rpc_http:
        return None
    try:
        payload = {
            "jsonrpc": "2.0",
            "id": _next_id(),
            "method": "getAccountInfo",
            "params": [address, {"encoding": "base64"}],
        }
        resp = await _client.post(cfg.rpc_http, json=payload)
        data = resp.json()
        account = data.get("result", {}).get("value")

        # Get tx count via getSignaturesForAddress
        sig_payload = {
            "jsonrpc": "2.0",
            "id": _next_id(),
            "method": "getSignaturesForAddress",
            "params": [address, {"limit": 1000}],
        }
        sig_resp = await _client.post(cfg.rpc_http, json=sig_payload)
        sigs = sig_resp.json().get("result", [])

        return {
            "chain": "solana",
            "address": address,
            "balance": account.get("lamports", 0) if account else 0,
            "tx_count": len(sigs),
            "tx_in_count": 0,
            "tx_out_count": len(sigs),
            "is_contract": account.get("executable", False) if account else False,
            "code_size": 0,
            "first_seen": None,
            "last_seen": datetime.now(timezone.utc),
        }
    except Exception as e:
        logger.error(f"Solana fetch error: {e}")
        return None


async def _get_btc_address_info(address: str) -> Dict:
    """Fetch BTC address info via public API (mempool.space)."""
    try:
        resp = await _client.get(f"https://mempool.space/api/address/{address}")
        data = resp.json()
        chain_stats = data.get("chain_stats", {})
        return {
            "chain": "btc",
            "address": address,
            "balance": chain_stats.get("funded_txo_sum", 0) - chain_stats.get("spent_txo_sum", 0),
            "tx_count": chain_stats.get("tx_count", 0),
            "tx_in_count": chain_stats.get("funded_txo_count", 0),
            "tx_out_count": chain_stats.get("spent_txo_count", 0),
            "is_contract": False,
            "code_size": 0,
            "first_seen": None,
            "last_seen": datetime.now(timezone.utc),
        }
    except Exception as e:
        logger.error(f"BTC fetch error: {e}")
        return None
