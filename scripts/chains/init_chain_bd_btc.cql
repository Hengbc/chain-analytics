-- ============================================================
-- BITCOIN (BTC) — Keyspace: chain_bd_btc
-- Block time: 10min | Data: ~5% of total | Priority: ARCHIVE
-- Retention: FOREVER (historical blockchain data)
-- ============================================================

CREATE KEYSPACE IF NOT EXISTS chain_bd_btc
WITH replication = {'class': 'NetworkTopologyStrategy', 'datacenter1': 2}
AND durable_writes = true;

USE chain_bd_btc;

-- BLOCKS (no TTL, keep forever)
CREATE TABLE IF NOT EXISTS blocks_by_day (
    day date,
    block_number bigint,
    block_hash text,
    parent_hash text,
    timestamp timestamp,
    tx_count int,
    size_bytes bigint,
    weight bigint,
    PRIMARY KEY ((day), block_number)
) WITH CLUSTERING ORDER BY (block_number DESC)
   AND compaction = {'class': 'LeveledCompactionStrategy'};

-- TRANSACTIONS (bucketed by address + month for BTC)
CREATE TABLE IF NOT EXISTS transactions_by_address (
    address_bucket int,
    address text,
    month text,
    block_number bigint,
    tx_index int,
    tx_hash text,
    inputs frozen<list<text>>,
    outputs frozen<list<text>>,
    value_in bigint,
    value_out bigint,
    fee bigint,
    timestamp timestamp,
    PRIMARY KEY ((address_bucket, address, month), block_number, tx_index)
) WITH CLUSTERING ORDER BY (block_number DESC, tx_index DESC)
   AND compaction = {'class': 'LeveledCompactionStrategy'};

-- TRANSACTIONS (by hash)
CREATE TABLE IF NOT EXISTS transactions_by_hash (
    tx_hash text,
    block_number bigint,
    tx_index int,
    inputs frozen<list<text>>,
    outputs frozen<list<text>>,
    value_in bigint,
    value_out bigint,
    fee bigint,
    timestamp timestamp,
    PRIMARY KEY ((tx_hash))
);

-- WALLETS (aggregated profiles)
CREATE TABLE IF NOT EXISTS wallets (
    address_bucket int,
    address text,
    first_seen timestamp,
    last_seen timestamp,
    tx_count bigint,
    tx_in_count bigint,
    tx_out_count bigint,
    total_value_in bigint,
    total_value_out bigint,
    current_balance bigint,
    wallet_type text,
    wallet_tier text,
    risk_score float,
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
    last_block bigint,
    last_block_hash text,
    last_block_timestamp timestamp,
    blocks_indexed_today bigint,
    tx_indexed_today bigint,
    updated_at timestamp,
    status text,
    error_message text,
    PRIMARY KEY ((shard))
);

-- DAILY STATS
CREATE TABLE IF NOT EXISTS daily_stats (
    year_month text,
    date date,
    total_tx bigint,
    total_blocks int,
    unique_wallets bigint,
    total_value bigint,
    avg_fee bigint,
    new_wallets bigint,
    PRIMARY KEY ((year_month), date)
) WITH CLUSTERING ORDER BY (date DESC);
