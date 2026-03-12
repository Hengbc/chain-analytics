-- ============================================================
-- Chain-BD: ScyllaDB Schema — Multi-chain Behavior Analytics
-- Supports: ETH, BNB, ARB, OP, BASE, AVAX, XLAYER, POLYGON, SOLANA, BTC
-- ============================================================

CREATE KEYSPACE IF NOT EXISTS chain_bd
WITH replication = {'class': 'SimpleStrategy', 'replication_factor': 1}
AND durable_writes = true;

USE chain_bd;

-- ────────────────────────────────────────────
-- 1. BLOCKS — latest blocks per chain
-- Partition: chain | Cluster: block_number DESC (fast latest-first)
-- ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS blocks (
    chain         text,
    block_number  bigint,
    block_hash    text,
    parent_hash   text,
    timestamp     timestamp,
    tx_count      int,
    gas_used      bigint,
    gas_limit     bigint,
    base_fee      bigint,
    PRIMARY KEY ((chain), block_number)
) WITH CLUSTERING ORDER BY (block_number DESC)
   AND compaction = {'class': 'TimeWindowCompactionStrategy', 'compaction_window_unit': 'DAYS', 'compaction_window_size': 1}
   AND gc_grace_seconds = 86400;

-- ────────────────────────────────────────────
-- 2. TRANSACTIONS — by address per chain
-- Partition: (chain, address) | Cluster: block_number DESC, tx_index DESC
-- ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS transactions_by_address (
    chain           text,
    address         text,
    block_number    bigint,
    tx_index        int,
    tx_hash         text,
    from_address    text,
    to_address      text,
    value           varint,
    gas_price       bigint,
    gas_used        bigint,
    input_data      text,
    status          tinyint,
    timestamp       timestamp,
    method_id       text,
    PRIMARY KEY ((chain, address), block_number, tx_index)
) WITH CLUSTERING ORDER BY (block_number DESC, tx_index DESC)
   AND compaction = {'class': 'TimeWindowCompactionStrategy', 'compaction_window_unit': 'DAYS', 'compaction_window_size': 1}
   AND gc_grace_seconds = 86400;

-- Secondary index on tx_hash for direct lookup
CREATE INDEX IF NOT EXISTS idx_tx_hash ON transactions_by_address (tx_hash);

-- ────────────────────────────────────────────
-- 3. TRANSACTIONS — by hash (direct lookup)
-- ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS transactions_by_hash (
    chain           text,
    tx_hash         text,
    block_number    bigint,
    tx_index        int,
    from_address    text,
    to_address      text,
    value           varint,
    gas_price       bigint,
    gas_used        bigint,
    input_data      text,
    status          tinyint,
    timestamp       timestamp,
    method_id       text,
    PRIMARY KEY ((chain, tx_hash))
);

-- ────────────────────────────────────────────
-- 4. TOKEN TRANSFERS (ERC-20 / SPL)
-- Partition: (chain, address) | Cluster: block_number DESC
-- ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS token_transfers (
    chain             text,
    address           text,
    block_number      bigint,
    log_index         int,
    tx_hash           text,
    token_address     text,
    from_address      text,
    to_address        text,
    value             varint,
    token_symbol      text,
    token_decimals    tinyint,
    timestamp         timestamp,
    PRIMARY KEY ((chain, address), block_number, log_index)
) WITH CLUSTERING ORDER BY (block_number DESC, log_index DESC)
   AND compaction = {'class': 'TimeWindowCompactionStrategy', 'compaction_window_unit': 'DAYS', 'compaction_window_size': 1};

-- Fast lookup by token contract
CREATE INDEX IF NOT EXISTS idx_token_addr ON token_transfers (token_address);

-- ────────────────────────────────────────────
-- 5. WALLETS — aggregated profile per chain
-- Partition: (chain, address) — single row per wallet per chain
-- ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS wallets (
    chain               text,
    address             text,
    first_seen          timestamp,
    last_seen           timestamp,
    tx_count            bigint,
    tx_in_count         bigint,
    tx_out_count        bigint,
    total_value_in      varint,
    total_value_out     varint,
    token_count         int,
    unique_interactions int,
    gas_spent           varint,
    -- classification
    wallet_type         text,       -- user / exchange / bot / bridge / contract / unknown
    wallet_tier         text,       -- whale / shark / dolphin / shrimp
    risk_score          float,
    confidence          float,
    is_contract         boolean,
    tags                set<text>,
    -- manual review
    reviewed            boolean,
    reviewed_by         text,
    reviewed_at         timestamp,
    review_notes        text,
    updated_at          timestamp,
    PRIMARY KEY ((chain, address))
);

-- Global wallet lookup by type (for dashboard filters)
CREATE INDEX IF NOT EXISTS idx_wallet_type ON wallets (wallet_type);
CREATE INDEX IF NOT EXISTS idx_wallet_tier ON wallets (wallet_tier);
CREATE INDEX IF NOT EXISTS idx_is_contract ON wallets (is_contract);

-- ────────────────────────────────────────────
-- 6. WALLETS — time-sorted for dashboard listing
-- Partition: chain | Cluster: updated_at DESC
-- ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS wallets_by_time (
    chain               text,
    updated_at          timestamp,
    address             text,
    wallet_type         text,
    wallet_tier         text,
    risk_score          float,
    tx_count            bigint,
    first_seen          timestamp,
    last_seen           timestamp,
    tags                set<text>,
    PRIMARY KEY ((chain), updated_at, address)
) WITH CLUSTERING ORDER BY (updated_at DESC, address ASC);

-- ────────────────────────────────────────────
-- 7. LABELS — known address labels
-- Partition: address
-- ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS labels (
    address         text,
    chain           text,
    label           text,
    category        text,       -- exchange / defi / bridge / scam / nft / dao
    source          text,       -- manual / etherscan / imported
    added_at        timestamp,
    added_by        text,
    PRIMARY KEY ((address), chain)
);

CREATE INDEX IF NOT EXISTS idx_label_category ON labels (category);

-- ────────────────────────────────────────────
-- 8. INDEXER STATE — track sync progress per chain
-- ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS indexer_state (
    chain               text,
    last_block          bigint,
    last_block_hash     text,
    updated_at          timestamp,
    status              text,       -- syncing / idle / error
    error_message       text,
    PRIMARY KEY ((chain))
);

-- ────────────────────────────────────────────
-- 9. TOKEN METADATA — cache token info
-- ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS token_metadata (
    chain           text,
    token_address   text,
    name            text,
    symbol          text,
    decimals        tinyint,
    total_supply    varint,
    logo_url        text,
    updated_at      timestamp,
    PRIMARY KEY ((chain, token_address))
);

-- ────────────────────────────────────────────
-- 10. DAILY STATS — aggregated per chain per day
-- ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS daily_stats (
    chain           text,
    date            date,
    total_tx        bigint,
    total_blocks    int,
    unique_wallets  bigint,
    total_gas_used  varint,
    avg_gas_price   bigint,
    total_value     varint,
    PRIMARY KEY ((chain), date)
) WITH CLUSTERING ORDER BY (date DESC);
