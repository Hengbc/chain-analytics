-- ============================================================
-- SOLANA (SOL) — Keyspace: chain_bd_solana
-- Block time: 0.4s | Data: ~15% of total | Priority: HIGH
-- Retention: 30 days raw (massive throughput, 2M tx/day)
-- ============================================================

CREATE KEYSPACE IF NOT EXISTS chain_bd_solana
WITH replication = {'class': 'NetworkTopologyStrategy', 'datacenter1': 3}
AND durable_writes = true;

USE chain_bd_solana;

-- BLOCKS (hour-bucketed for Solana's speed)
CREATE TABLE IF NOT EXISTS blocks_by_hour (
    hour timestamp,
    slot bigint,
    block_hash text,
    parent_slot bigint,
    timestamp timestamp,
    tx_count int,
    PRIMARY KEY ((hour), slot)
) WITH CLUSTERING ORDER BY (slot DESC)
   AND compaction = {'class': 'TimeWindowCompactionStrategy', 'compaction_window_unit': 'HOURS', 'compaction_window_size': 1}
   AND default_time_to_live = 2592000;

-- TRANSACTIONS (bucketed by address + day for Solana)
CREATE TABLE IF NOT EXISTS transactions_by_address (
    address_bucket int,
    address text,
    day date,
    slot bigint,
    tx_index int,
    signature text,
    signer text,
    instructions frozen<list<text>>,
    accounts frozen<list<text>>,
    lamports_in bigint,
    lamports_out bigint,
    fee bigint,
    status text,
    timestamp timestamp,
    PRIMARY KEY ((address_bucket, address, day), slot, tx_index)
) WITH CLUSTERING ORDER BY (slot DESC, tx_index DESC)
   AND compaction = {'class': 'TimeWindowCompactionStrategy', 'compaction_window_unit': 'DAYS', 'compaction_window_size': 1}
   AND default_time_to_live = 2592000;

-- TRANSACTIONS (by signature)
CREATE TABLE IF NOT EXISTS transactions_by_signature (
    signature text,
    slot bigint,
    tx_index int,
    signer text,
    instructions frozen<list<text>>,
    accounts frozen<list<text>>,
    lamports_in bigint,
    lamports_out bigint,
    fee bigint,
    status text,
    timestamp timestamp,
    PRIMARY KEY ((signature))
) WITH default_time_to_live = 2592000;

-- SPL TOKEN TRANSFERS (day-bucketed)
CREATE TABLE IF NOT EXISTS token_transfers_by_address (
    address_bucket int,
    address text,
    day date,
    slot bigint,
    tx_index int,
    signature text,
    mint text,
    from_address text,
    to_address text,
    amount bigint,
    decimals tinyint,
    timestamp timestamp,
    PRIMARY KEY ((address_bucket, address, day), slot, tx_index)
) WITH CLUSTERING ORDER BY (slot DESC, tx_index DESC)
   AND default_time_to_live = 2592000;

-- WALLETS (aggregated profiles)
CREATE TABLE IF NOT EXISTS wallets (
    address_bucket int,
    address text,
    first_seen timestamp,
    last_seen timestamp,
    tx_count bigint,
    spl_token_count int,
    lamports_in bigint,
    lamports_out bigint,
    current_balance bigint,
    wallet_type text,
    wallet_tier text,
    risk_score float,
    is_program boolean,
    tags set<text>,
    updated_at timestamp,
    PRIMARY KEY ((address_bucket, address))
);

-- WALLETS BY TYPE
CREATE TABLE IF NOT EXISTS wallets_by_type (
    wallet_type text,
    wallet_tier text,
    risk_score float,
    address text,
    tx_count bigint,
    updated_at timestamp,
    PRIMARY KEY ((wallet_type, wallet_tier), risk_score, address)
) WITH CLUSTERING ORDER BY (risk_score DESC, address ASC);

-- LABELS
CREATE TABLE IF NOT EXISTS labels (
    address_bucket int,
    address text,
    label text,
    category text,
    source text,
    added_at timestamp,
    PRIMARY KEY ((address_bucket, address))
);

-- INDEXER STATE
CREATE TABLE IF NOT EXISTS indexer_state (
    shard int,
    last_slot bigint,
    last_block_hash text,
    last_block_timestamp timestamp,
    blocks_indexed_today bigint,
    tx_indexed_today bigint,
    updated_at timestamp,
    status text,
    error_message text,
    PRIMARY KEY ((shard))
);

-- TOKEN METADATA (SPL tokens)
CREATE TABLE IF NOT EXISTS token_metadata (
    mint text,
    name text,
    symbol text,
    decimals tinyint,
    supply bigint,
    logo_url text,
    updated_at timestamp,
    PRIMARY KEY ((mint))
);

-- HOURLY STATS (Solana moves fast)
CREATE TABLE IF NOT EXISTS hourly_stats (
    day date,
    hour timestamp,
    total_tx bigint,
    total_blocks int,
    unique_wallets bigint,
    total_lamports bigint,
    avg_fee bigint,
    PRIMARY KEY ((day), hour)
) WITH CLUSTERING ORDER BY (hour DESC)
   AND default_time_to_live = 2592000;

-- DAILY STATS
CREATE TABLE IF NOT EXISTS daily_stats (
    year_month text,
    date date,
    total_tx bigint,
    total_blocks int,
    unique_wallets bigint,
    total_lamports bigint,
    avg_fee bigint,
    new_wallets bigint,
    PRIMARY KEY ((year_month), date)
) WITH CLUSTERING ORDER BY (date DESC);
