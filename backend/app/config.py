
"""Central configuration — reads from .env / environment."""

from pydantic_settings import BaseSettings
from typing import Optional


class Settings(BaseSettings):
    # ── ScyllaDB ──
    scylla_hosts: str = "scylladb"
    scylla_keyspace: str = "chain_bd"
    scylla_port: int = 9042

    # ── Redis ──
    redis_url: str = "redis://redis:6379/0"

    # ── API ──
    api_host: str = "0.0.0.0"
    api_port: int = 3001

    # ── Chain RPC ──
    eth_rpc_http: str = "http://100.100.0.126:8547"
    eth_rpc_ws: str = "ws://100.100.0.126:8548"
    bnb_rpc_http: str = "https://bsc-dataseed.binance.org"
    bnb_rpc_ws: str = ""
    arb_rpc_http: str = "https://arb1.arbitrum.io/rpc"
    arb_rpc_ws: str = ""
    op_rpc_http: str = "https://mainnet.optimism.io"
    op_rpc_ws: str = ""
    base_rpc_http: str = "https://mainnet.base.org"
    base_rpc_ws: str = ""
    avax_rpc_http: str = "https://api.avax.network/ext/bc/C/rpc"
    avax_rpc_ws: str = ""
    xlayer_rpc_http: str = "https://rpc.xlayer.tech"
    xlayer_rpc_ws: str = ""
    polygon_rpc_http: str = "https://polygon-rpc.com"
    polygon_rpc_ws: str = ""
    solana_rpc_http: str = "https://api.mainnet-beta.solana.com"
    solana_rpc_ws: str = ""
    btc_rpc_http: str = ""
    btc_rpc_ws: str = ""

    # ── Indexer ──
    indexer_batch_size: int = 100
    indexer_poll_interval: int = 2
    # Only ETH has a local node configured. Add other chains in .env if you have their RPCs.
    indexer_enabled_chains: str = "eth"

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


settings = Settings()
