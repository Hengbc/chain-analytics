"""Pydantic models for wallet API."""

from pydantic import BaseModel, Field
from typing import Optional, List, Set
from datetime import datetime
from enum import Enum


class WalletType(str, Enum):
    user = "user"
    exchange = "exchange"
    bot = "bot"
    bridge = "bridge"
    contract = "contract"
    malicious = "malicious"
    unknown = "unknown"


class WalletTier(str, Enum):
    whale = "whale"
    shark = "shark"
    dolphin = "dolphin"
    shrimp = "shrimp"


class ChainEnum(str, Enum):
    eth = "eth"
    bnb = "bnb"
    arb = "arb"
    op = "op"
    base = "base"
    avax = "avax"
    xlayer = "xlayer"
    polygon = "polygon"
    solana = "solana"
    btc = "btc"


class WalletResponse(BaseModel):
    chain: str
    address: str
    first_seen: Optional[datetime] = None
    last_seen: Optional[datetime] = None
    tx_count: int = 0
    tx_in_count: int = 0
    tx_out_count: int = 0
    total_value_in: Optional[str] = "0"
    total_value_out: Optional[str] = "0"
    token_count: int = 0
    unique_interactions: int = 0
    gas_spent: Optional[str] = "0"
    wallet_type: Optional[str] = "unknown"
    wallet_tier: Optional[str] = None
    risk_score: float = 0.0
    confidence: float = 0.0
    is_contract: bool = False
    tags: List[str] = []
    reviewed: bool = False
    reviewed_by: Optional[str] = None
    reviewed_at: Optional[datetime] = None
    review_notes: Optional[str] = None
    updated_at: Optional[datetime] = None


class WalletListResponse(BaseModel):
    wallets: List[WalletResponse]
    total: int
    page: int
    page_size: int


class WalletActivityTransaction(BaseModel):
    tx_hash: str
    from_address: Optional[str] = None
    to_address: Optional[str] = None
    value: str = "0"
    gas_price: str = "0"
    gas_used: str = "0"
    status: int = 0
    block_number: int = 0
    timestamp: Optional[datetime] = None
    method_id: Optional[str] = None


class WalletActivityTokenTransfer(BaseModel):
    tx_hash: str
    token_address: Optional[str] = None
    token_symbol: Optional[str] = None
    token_decimals: int = 0
    from_address: Optional[str] = None
    to_address: Optional[str] = None
    value: str = "0"
    block_number: int = 0
    timestamp: Optional[datetime] = None


class WalletActivityResponse(BaseModel):
    source: str = "node-indexer"
    chain: str
    address: str
    tx_count: int = 0
    token_transfer_total: int = 0
    last_indexed_block: int = 0
    indexer_status: str = "unknown"
    eth_price: str = "0"
    transactions: List[WalletActivityTransaction] = []
    token_transfers: List[WalletActivityTokenTransfer] = []
    last_seen: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class DashboardSeedWallet(BaseModel):
    id: int
    address: str
    balance: str = "0"
    txCount: int = 0
    fundedBy: Optional[str] = None
    createdAt: str
    dataSource: str = "R"
    clientType: str = "U"
    clientTier: str = "L1"
    review: str = "M"
    freqCycle: str = "Y"
    freqTier: str = "F1"
    addressPurity: str = "C"


class DashboardSeedResponse(BaseModel):
    chain: str
    latest_block: int
    blocks_scanned: int
    addresses_collected: int
    wallets: List[DashboardSeedWallet]


class AnalyzeRequest(BaseModel):
    chain: ChainEnum
    address: str


class BulkAnalyzeRequest(BaseModel):
    chain: ChainEnum
    addresses: List[str] = Field(..., max_length=100)


class ReviewRequest(BaseModel):
    wallet_type: Optional[WalletType] = None
    wallet_tier: Optional[WalletTier] = None
    risk_score: Optional[float] = None
    tags: Optional[List[str]] = None
    review_notes: Optional[str] = None
    reviewed_by: str = "manual"


class LabelResponse(BaseModel):
    address: str
    chain: str
    label: str
    category: Optional[str] = None
    source: Optional[str] = None
    added_at: Optional[datetime] = None


class LabelCreateRequest(BaseModel):
    address: str
    chain: ChainEnum
    label: str
    category: Optional[str] = None
    source: str = "manual"


class StatsResponse(BaseModel):
    chain: str
    total_wallets: int = 0
    total_transactions: int = 0
    total_blocks: int = 0
    wallets_by_type: dict = {}
    wallets_by_tier: dict = {}
    last_indexed_block: int = 0
    indexer_status: str = "unknown"


class HealthResponse(BaseModel):
    status: str = "ok"
    scylla: str = "unknown"
    redis: str = "unknown"
    chains: dict = {}
