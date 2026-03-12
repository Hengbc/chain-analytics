-- ============================================================
-- Optimism (ETH)
-- Keyspace: chain_bd_op
-- Priority: MEDIUM
-- Retention: 60 days
-- Replication Factor: 2
-- Notes: Layer 2, 2s blocks
-- ============================================================

-- ============================================================
-- BASE EVM SCHEMA TEMPLATE
-- Applies to: ETH, BNB, ARB, OP, BASE, POLYGON, AVAX, XLAYER
-- Account-based model with smart contracts + ERC tokens
-- ============================================================

-- VARIABLES (to be replaced per chain):
-- chain_bd_op = chain_bd_eth | chain_bd_bnb | ...
-- 2 = replication factor (1, 2, or 3)
-- 5184000 = time-to-live in seconds
-- Optimism = Ethereum | BNB Chain | ...

CREATE KEYSPACE IF NOT EXISTS chain_bd_op
WITH replication = {'class': 'NetworkTopologyStrategy', 'datacenter1': 2}
AND durable_writes = true;

USE chain_bd_op;

-- ────────────────────────────────────────────
-- 1. BLOCKS (time-bucketed by day)
-- EVM chains have: block number, hash, gas, miner
-- ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS blocks_by_day (
    day date,
    block_number bigint,
    block_hash text,
    parent_hash text,
    timestamp timestamp,
    tx_count int,
    gas_used bigint,
    gas_limit bigint,
    base_fee bigint,            -- EIP-1559 base fee (0 for pre-London)
    miner text,                 -- Block producer address
    difficulty varint,          -- PoW difficulty (0 for PoS chains)
    total_difficulty varint,
    size_bytes bigint,
    PRIMARY KEY ((day), block_number)
) WITH CLUSTERING ORDER BY (block_number DESC)
   AND compaction = {'class': 'TimeWindowCompactionStrategy', 'compaction_window_unit': 'DAYS', 'compaction_window_size': 1}
   AND default_time_to_live = 5184000
   AND gc_grace_seconds = 86400;

-- ────────────────────────────────────────────
-- 2. TRANSACTIONS (bucketed by address + week)
-- EVM model: from/to addresses, gas, value in wei
-- ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS transactions_by_address (
    address_bucket int,         -- hash(address) % 1000
    address text,
    week text,                  -- YYYY-Www format
    block_number bigint,
    tx_index int,
    tx_hash text,
    from_address text,
    to_address text,            -- NULL for contract creation
    value varint,               -- Wei (18 decimals)
    gas_price bigint,
    gas_used bigint,
    max_fee_per_gas bigint,     -- EIP-1559 (0 if legacy tx)
    max_priority_fee bigint,    -- EIP-1559 tip
    status tinyint,             -- 1 = success, 0 = reverted
    timestamp timestamp,
    method_id text,             -- First 4 bytes (0x12345678)
    input_data_size int,        -- Size of calldata in bytes
    nonce bigint,
    PRIMARY KEY ((address_bucket, address, week), block_number, tx_index)
) WITH CLUSTERING ORDER BY (block_number DESC, tx_index DESC)
   AND compaction = {'class': 'TimeWindowCompactionStrategy', 'compaction_window_unit': 'DAYS', 'compaction_window_size': 7}
   AND default_time_to_live = 5184000
   AND gc_grace_seconds = 86400;

-- ────────────────────────────────────────────
-- 3. TRANSACTIONS (by hash for direct lookup)
-- ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS transactions_by_hash (
    tx_hash text,
    block_number bigint,
    tx_index int,
    from_address text,
    to_address text,
    value varint,
    gas_price bigint,
    gas_used bigint,
    max_fee_per_gas bigint,
    max_priority_fee bigint,
    status tinyint,
    timestamp timestamp,
    method_id text,
    input_data_size int,
    nonce bigint,
    PRIMARY KEY ((tx_hash))
) WITH default_time_to_live = 5184000;

-- ────────────────────────────────────────────
-- 4. TOKEN TRANSFERS (ERC-20/721/1155 events)
-- Parsed from transaction logs
-- ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS token_transfers_by_address (
    address_bucket int,
    address text,
    week text,
    block_number bigint,
    log_index int,
    tx_hash text,
    token_address text,         -- ERC-20/721 contract address
    token_type text,            -- erc20 | erc721 | erc1155
    from_address text,
    to_address text,
    value varint,               -- Token amount (raw)
    token_id varint,            -- For ERC-721/1155 (NULL for ERC-20)
    token_symbol text,
    token_decimals tinyint,
    timestamp timestamp,
    PRIMARY KEY ((address_bucket, address, week), block_number, log_index)
) WITH CLUSTERING ORDER BY (block_number DESC, log_index DESC)
   AND compaction = {'class': 'TimeWindowCompactionStrategy', 'compaction_window_unit': 'DAYS', 'compaction_window_size': 7}
   AND default_time_to_live = 5184000;

-- ────────────────────────────────────────────
-- 5. TOKEN TRANSFERS (by token contract)
-- For token analytics and holder tracking
-- ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS token_transfers_by_token (
    token_bucket int,           -- hash(token_address) % 100
    token_address text,
    day date,
    block_number bigint,
    log_index int,
    tx_hash text,
    from_address text,
    to_address text,
    value varint,
    token_id varint,
    timestamp timestamp,
    PRIMARY KEY ((token_bucket, token_address, day), block_number, log_index)
) WITH CLUSTERING ORDER BY (block_number DESC, log_index DESC)
   AND default_time_to_live = 2592000;  -- 30 days for token analytics

-- ────────────────────────────────────────────
-- 6. WALLETS (aggregated profiles, no TTL)
-- Computed periodically from transaction history
-- ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS wallets (
    address_bucket int,
    address text,
    first_seen timestamp,
    last_seen timestamp,
    tx_count bigint,
    tx_in_count bigint,         -- Transactions received
    tx_out_count bigint,        -- Transactions sent
    total_value_in varint,      -- Wei received (lifetime)
    total_value_out varint,     -- Wei sent (lifetime)
    current_balance varint,     -- Current balance (if tracked)
    token_count int,            -- Unique ERC-20 tokens held
    nft_count int,              -- Unique ERC-721 tokens held
    unique_interactions int,    -- Unique addresses interacted with
    gas_spent varint,           -- Total gas paid (wei)
    -- Classification
    wallet_type text,           -- user | exchange | bot | bridge | contract | unknown
    wallet_tier text,           -- whale | shark | dolphin | shrimp
    risk_score float,
    confidence float,
    is_contract boolean,
    contract_deployer text,     -- If contract, who deployed it
    tags set<text>,
    -- Manual review
    reviewed boolean,
    reviewed_by text,
    reviewed_at timestamp,
    review_notes text,
    updated_at timestamp,
    PRIMARY KEY ((address_bucket, address))
);

-- ────────────────────────────────────────────
-- 7. WALLETS BY TYPE (denormalized for filtering)
-- ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS wallets_by_type (
    wallet_type text,
    wallet_tier text,
    risk_score float,
    address text,
    tx_count bigint,
    current_balance varint,
    updated_at timestamp,
    tags set<text>,
    PRIMARY KEY ((wallet_type, wallet_tier), risk_score, address)
) WITH CLUSTERING ORDER BY (risk_score DESC, address ASC);

-- ────────────────────────────────────────────
-- 8. WALLETS BY ACTIVITY (recent activity feed)
-- ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS wallets_by_activity (
    day date,
    updated_at timestamp,
    address text,
    wallet_type text,
    wallet_tier text,
    risk_score float,
    tx_count bigint,
    tags set<text>,
    PRIMARY KEY ((day), updated_at, address)
) WITH CLUSTERING ORDER BY (updated_at DESC, address ASC)
   AND default_time_to_live = 5184000;

-- ────────────────────────────────────────────
-- 9. SMART CONTRACTS (deployed contracts)
-- ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS contracts (
    address_bucket int,
    address text,
    deployer text,              -- Who deployed this contract
    deployment_tx text,
    deployment_block bigint,
    deployment_timestamp timestamp,
    bytecode_size int,
    is_verified boolean,
    contract_name text,
    compiler_version text,
    optimization_enabled boolean,
    tags set<text>,
    PRIMARY KEY ((address_bucket, address))
);

-- ────────────────────────────────────────────
-- 10. LABELS (known addresses)
-- ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS labels (
    address_bucket int,
    address text,
    label text,
    category text,              -- exchange | defi | bridge | scam | nft | dao
    source text,                -- manual | etherscan | imported
    added_at timestamp,
    added_by text,
    PRIMARY KEY ((address_bucket, address))
);

-- ────────────────────────────────────────────
-- 11. LABELS BY CATEGORY (for filtering)
-- ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS labels_by_category (
    category text,
    address text,
    label text,
    source text,
    added_at timestamp,
    PRIMARY KEY ((category), address)
);

-- ────────────────────────────────────────────
-- 12. TOKEN METADATA (ERC-20/721 info cache)
-- ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS token_metadata (
    token_address text,
    token_type text,            -- erc20 | erc721 | erc1155
    name text,
    symbol text,
    decimals tinyint,           -- Usually 18 for ERC-20
    total_supply varint,
    holders_count bigint,
    deployer text,
    deployment_block bigint,
    logo_url text,
    is_verified boolean,
    updated_at timestamp,
    PRIMARY KEY ((token_address))
);

-- ────────────────────────────────────────────
-- 13. INDEXER STATE (sync progress tracking)
-- ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS indexer_state (
    shard int,                  -- Shard ID for distributed indexing
    last_block bigint,
    last_block_hash text,
    last_block_timestamp timestamp,
    blocks_indexed_today bigint,
    tx_indexed_today bigint,
    updated_at timestamp,
    status text,                -- syncing | idle | error
    error_message text,
    PRIMARY KEY ((shard))
);

-- ────────────────────────────────────────────
-- 14. DAILY STATS (aggregated per day)
-- ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS daily_stats (
    year_month text,            -- YYYY-MM bucket
    date date,
    total_tx bigint,
    total_blocks int,
    unique_wallets bigint,
    unique_contracts bigint,
    total_gas_used varint,
    avg_gas_price bigint,
    total_value_transferred varint,
    new_wallets bigint,
    new_contracts bigint,
    active_wallets bigint,
    PRIMARY KEY ((year_month), date)
) WITH CLUSTERING ORDER BY (date DESC);

-- ────────────────────────────────────────────
-- 15. HOURLY STATS (for real-time dashboards)
-- ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS hourly_stats (
    day date,
    hour timestamp,
    total_tx bigint,
    total_blocks int,
    unique_wallets bigint,
    total_gas_used varint,
    avg_gas_price bigint,
    total_value_transferred varint,
    PRIMARY KEY ((day), hour)
) WITH CLUSTERING ORDER BY (hour DESC)
   AND default_time_to_live = 2592000;  -- 30 days
