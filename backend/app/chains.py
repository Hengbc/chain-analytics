"""Chain registry — 10 chains with their config."""

from dataclasses import dataclass
from typing import Dict, Optional
from app.config import settings


@dataclass
class ChainConfig:
    chain_id: int
    name: str
    symbol: str
    rpc_http: str
    rpc_ws: str
    is_evm: bool = True
    block_time: float = 12.0  # seconds
    explorer: str = ""


def build_chains() -> Dict[str, ChainConfig]:
    return {
        "eth": ChainConfig(
            chain_id=1,
            name="Ethereum",
            symbol="ETH",
            rpc_http=settings.eth_rpc_http,
            rpc_ws=settings.eth_rpc_ws,
            block_time=12.0,
            explorer="https://etherscan.io",
        ),
        "bnb": ChainConfig(
            chain_id=56,
            name="BNB Chain",
            symbol="BNB",
            rpc_http=settings.bnb_rpc_http,
            rpc_ws=settings.bnb_rpc_ws,
            block_time=3.0,
            explorer="https://bscscan.com",
        ),
        "arb": ChainConfig(
            chain_id=42161,
            name="Arbitrum One",
            symbol="ETH",
            rpc_http=settings.arb_rpc_http,
            rpc_ws=settings.arb_rpc_ws,
            block_time=0.25,
            explorer="https://arbiscan.io",
        ),
        "op": ChainConfig(
            chain_id=10,
            name="Optimism",
            symbol="ETH",
            rpc_http=settings.op_rpc_http,
            rpc_ws=settings.op_rpc_ws,
            block_time=2.0,
            explorer="https://optimistic.etherscan.io",
        ),
        "base": ChainConfig(
            chain_id=8453,
            name="Base",
            symbol="ETH",
            rpc_http=settings.base_rpc_http,
            rpc_ws=settings.base_rpc_ws,
            block_time=2.0,
            explorer="https://basescan.org",
        ),
        "avax": ChainConfig(
            chain_id=43114,
            name="Avalanche C-Chain",
            symbol="AVAX",
            rpc_http=settings.avax_rpc_http,
            rpc_ws=settings.avax_rpc_ws,
            block_time=2.0,
            explorer="https://snowtrace.io",
        ),
        "xlayer": ChainConfig(
            chain_id=196,
            name="X Layer",
            symbol="OKB",
            rpc_http=settings.xlayer_rpc_http,
            rpc_ws=settings.xlayer_rpc_ws,
            block_time=2.0,
            explorer="https://www.oklink.com/xlayer",
        ),
        "polygon": ChainConfig(
            chain_id=137,
            name="Polygon PoS",
            symbol="MATIC",
            rpc_http=settings.polygon_rpc_http,
            rpc_ws=settings.polygon_rpc_ws,
            block_time=2.0,
            explorer="https://polygonscan.com",
        ),
        "solana": ChainConfig(
            chain_id=0,
            name="Solana",
            symbol="SOL",
            rpc_http=settings.solana_rpc_http,
            rpc_ws=settings.solana_rpc_ws,
            is_evm=False,
            block_time=0.4,
            explorer="https://solscan.io",
        ),
        "btc": ChainConfig(
            chain_id=0,
            name="Bitcoin",
            symbol="BTC",
            rpc_http=settings.btc_rpc_http,
            rpc_ws=settings.btc_rpc_ws,
            is_evm=False,
            block_time=600.0,
            explorer="https://mempool.space",
        ),
    }


CHAINS = build_chains()
ENABLED_CHAINS = [c.strip() for c in settings.indexer_enabled_chains.split(",") if c.strip()]
