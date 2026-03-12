-- ============================================================
-- Chain-BD: Production ScyllaDB Schema — 5 TRILLION+ Records
-- Optimized for: massive write throughput, hot partition handling,
-- time-based retention, zero secondary indexes
-- ============================================================

CREATE KEYSPACE IF NOT EXISTS chain_bd
WITH replication = {'class': 'NetworkTopologyStrategy', 'datacenter1': 3}
AND durable_writes = true;

USE chain_bd;

-- ════════════════════════════════════════════════════════════
-- DESIGN PRINCIPLES FOR 5T RECORDS:
-- 1. NO secondary indexes (all queries via partition key)
-- 2. Bucket hot addresses (exchanges/contracts) to spread load
-- 3. Time-bucketed partitions for TTL and data retention
-- 4. Denormalized query tables (storage is cheap, scans are expensive)
-- 5. Frozen types for nested data
-- 6. Separate read/write paths
-- ════════════════════════════════════════════════════════════

-- ────────────────────────────────────────────
-- 1. BLOCKS — time-bucketed by day
-- Write: 100M blocks/year across 10 chains = ~300K/day
-- Partition: (chain, day) | Cluster: block_number DESC
-- ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS blocks_by_day (
    chain text,
    day date,                    -- YYYY-MM-DD bucket
    block_number bigint,
    block_hash text,
    parent_hash text,
    timestamp timestamp,
    tx_count int,
    gas_used bigint,
    gas_limit bigint,
    base_fee bigint,
    PRIMARY KEY ((chain, day), block_number)
) WITH CLUSTERING ORDER BY (block_number DESC)
   AND compaction = {'class': 'TimeWindowCompactionStrategy', 'compaction_window_unit': 'DAYS', 'compaction_window_size': 1}
   AND default_time_to_live = 7776000  -- 90 days TTL (adjust as needed)
   AND gc_grace_seconds = 86400;

-- ────────────────────────────────────────────
-- 2. TRANSACTIONS — bucketed by address + time
-- Write: 5T records = need heavy bucketing
-- Partition: (chain, address_bucket, address, week) 
-- ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS transactions_by_address_bucketed (
    chain text,
    address_bucket int,          -- hash(address) % 1000 (1000 buckets per chain)
    address text,
    week text,                   -- YYYY-WW format (ISO week)
    block_number bigint,
    tx_index int,
    tx_hash text,
    from_address text,
    to_address text,
    value varint,
    gas_price bigint,
    gas_used bigint,
    status tinyint,
    timestamp timestamp,
    method_id text,              -- 0x12345678
    PRIMARY KEY ((chain, address_bucket, address, week), block_number, tx_index)
) WITH CLUSTERING ORDER BY (block_number DESC, tx_index DESC)
   AND compaction = {'class': 'TimeWindowCompactionStrategy', 'compaction_window_unit': 'DAYS', 'compaction_window_size': 7}
   AND default_time_to_live = 7776000
   AND gc_grace_seconds = 86400;

-- ────────────────────────────────────────────
-- 3. TRANSACTIONS — by hash (direct lookup, no bucketing)
-- Partition: (chain, tx_hash)
-- ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS transactions_by_hash (
    chain text,
    tx_hash text,
    block_number bigint,
    tx_index int,
    from_address text,
    to_address text,
    value varint,
    gas_price bigint,
    gas_used bigint,
    status tinyint,
    timestamp timestamp,
    method_id text,
    PRIMARY KEY ((chain, tx_hash))
) WITH default_time_to_live = 7776000;

-- ────────────────────────────────────────────
-- 4. TOKEN TRANSFERS — bucketed by address + time
-- Partition: (chain, address_bucket, address, week)
-- ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS token_transfers_bucketed (
    chain text,
    address_bucket int,          -- hash(address) % 1000
    address text,
    week text,                   -- YYYY-WW
    block_number bigint,
    log_index int,
    tx_hash text,
    token_address text,
    from_address text,
    to_address text,
    value varint,
    token_symbol text,
    token_decimals tinyint,
    timestamp timestamp,
    PRIMARY KEY ((chain, address_bucket, address, week), block_number, log_index)
) WITH CLUSTERING ORDER BY (block_number DESC, log_index DESC)
   AND compaction = {'class': 'TimeWindowCompactionStrategy', 'compaction_window_unit': 'DAYS', 'compaction_window_size': 7}
   AND default_time_to_live = 7776000;

-- ────────────────────────────────────────────
-- 5. TOKEN TRANSFERS — by token (for token analytics)
-- Partition: (chain, token_bucket, token_address, day)
-- ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS token_transfers_by_token (
    chain text,
    token_bucket int,            -- hash(token_address) % 100
    token_address text,
    day date,
    block_number bigint,
    log_index int,
    tx_hash text,
    from_address text,
    to_address text,
    value varint,
    timestamp timestamp,
    PRIMARY KEY ((chain, token_bucket, token_address, day), block_number, log_index)
) WITH CLUSTERING ORDER BY (block_number DESC, log_index DESC)
   AND compaction = {'class': 'TimeWindowCompactionStrategy', 'compaction_window_unit': 'DAYS', 'compaction_window_size': 1}
   AND default_time_to_live = 2592000;  -- 30 days for token analytics

-- ────────────────────────────────────────────
-- 6. WALLETS — aggregated profile (NO time in partition key)
-- Partition: (chain, address_bucket, address)
-- Updated periodically by aggregation jobs
-- ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS wallets_aggregated (
    chain text,
    address_bucket int,          -- hash(address) % 1000
    address text,
    first_seen timestamp,
    last_seen timestamp,
    tx_count bigint,
    tx_in_count bigint,
    tx_out_count bigint,
    total_value_in varint,
    total_value_out varint,
    token_count int,
    unique_interactions int,
    gas_spent varint,
    -- classification
    wallet_type text,            -- user / exchange / bot / bridge / contract / unknown
    wallet_tier text,            -- whale / shark / dolphin / shrimp
    risk_score float,
    confidence float,
    is_contract boolean,
    tags set<text>,
    -- manual review
    reviewed boolean,
    reviewed_by text,
    reviewed_at timestamp,
    review_notes text,
    updated_at timestamp,
    PRIMARY KEY ((chain, address_bucket, address))
) WITH default_time_to_live = 0;  -- no TTL, keep forever

-- ────────────────────────────────────────────
-- 7. WALLETS — by type (for dashboard filters)
-- Denormalized query table
-- Partition: (chain, wallet_type, tier)
-- ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS wallets_by_type (
    chain text,
    wallet_type text,
    wallet_tier text,
    risk_score float,
    address text,
    tx_count bigint,
    updated_at timestamp,
    tags set<text>,
    PRIMARY KEY ((chain, wallet_type, wallet_tier), risk_score, address)
) WITH CLUSTERING ORDER BY (risk_score DESC, address ASC);

-- ────────────────────────────────────────────
-- 8. WALLETS — recent activity (time-sorted)
-- Partition: (chain, day) for recent dashboard view
-- ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS wallets_by_activity (
    chain text,
    day date,
    updated_at timestamp,
    address text,
    wallet_type text,
    wallet_tier text,
    risk_score float,
    tx_count bigint,
    tags set<text>,
    PRIMARY KEY ((chain, day), updated_at, address)
) WITH CLUSTERING ORDER BY (updated_at DESC, address ASC)
   AND default_time_to_live = 7776000;

-- ────────────────────────────────────────────
-- 9. LABELS — known address labels
-- Partition: (address_bucket, address)
-- ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS labels (
    address_bucket int,          -- hash(address) % 100
    address text,
    chain text,
    label text,
    category text,               -- exchange / defi / bridge / scam / nft / dao
    source text,                 -- manual / etherscan / imported
    added_at timestamp,
    added_by text,
    PRIMARY KEY ((address_bucket, address), chain)
);

-- ────────────────────────────────────────────
-- 10. LABELS — by category (for filtering)
-- Denormalized query table
-- ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS labels_by_category (
    category text,
    chain text,
    address text,
    label text,
    source text,
    added_at timestamp,
    PRIMARY KEY ((category, chain), address)
);

-- ────────────────────────────────────────────
-- 11. INDEXER STATE — track sync progress
-- Partition: (chain)
-- ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS indexer_state (
    chain text,
    last_block bigint,
    last_block_hash text,
    last_block_timestamp timestamp,
    blocks_indexed_today bigint,
    tx_indexed_today bigint,
    updated_at timestamp,
    status text,                 -- syncing / idle / error
    error_message text,
    PRIMARY KEY ((chain))
);

-- ────────────────────────────────────────────
-- 12. TOKEN METADATA — cache (no bucketing, small dataset)
-- Partition: (chain, token_address)
-- ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS token_metadata (
    chain text,
    token_address text,
    name text,
    symbol text,
    decimals tinyint,
    total_supply varint,
    holders_count bigint,
    logo_url text,
    updated_at timestamp,
    PRIMARY KEY ((chain, token_address))
);

-- ────────────────────────────────────────────
-- 13. DAILY STATS — aggregated per chain
-- Partition: (chain, year_month) | Cluster: date DESC
-- ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS daily_stats (
    chain text,
    year_month text,             -- YYYY-MM for monthly buckets
    date date,
    total_tx bigint,
    total_blocks int,
    unique_wallets bigint,
    total_gas_used varint,
    avg_gas_price bigint,
    total_value varint,
    new_wallets bigint,
    active_wallets bigint,
    PRIMARY KEY ((chain, year_month), date)
) WITH CLUSTERING ORDER BY (date DESC);

-- ────────────────────────────────────────────
-- 14. HOURLY STATS — for real-time dashboards
-- Partition: (chain, day) | Cluster: hour DESC
-- ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS hourly_stats (
    chain text,
    day date,
    hour timestamp,
    total_tx bigint,
    total_blocks int,
    unique_wallets bigint,
    total_gas_used varint,
    avg_gas_price bigint,
    total_value varint,
    PRIMARY KEY ((chain, day), hour)
) WITH CLUSTERING ORDER BY (hour DESC)
   AND default_time_to_live = 2592000;  -- 30 days

-- ════════════════════════════════════════════════════════════
-- HELPER FUNCTIONS (use in app layer)
-- ════════════════════════════════════════════════════════════
-- address_bucket = hash(address.lower()) % 1000
-- token_bucket = hash(token_address.lower()) % 100
-- week = datetime.strftime('%Y-W%W')
-- day = datetime.date()
-- year_month = datetime.strftime('%Y-%m')
-- ════════════════════════════════════════════════════════════
