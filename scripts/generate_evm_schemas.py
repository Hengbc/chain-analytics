#!/usr/bin/env python3
"""Generate ScyllaDB schema files for EVM chains."""

EVM_CHAINS = {
    "bnb": {
        "name": "BNB Chain",
        "symbol": "BNB",
        "block_time": "3s",
        "data_percent": "20%",
        "priority": "HIGH",
        "ttl_days": 90,
        "replication_factor": 3,
    },
    "arb": {
        "name": "Arbitrum One",
        "symbol": "ETH",
        "block_time": "0.25s",
        "data_percent": "10%",
        "priority": "HIGH",
        "ttl_days": 60,
        "replication_factor": 2,
    },
    "op": {
        "name": "Optimism",
        "symbol": "ETH",
        "block_time": "2s",
        "data_percent": "5%",
        "priority": "MEDIUM",
        "ttl_days": 60,
        "replication_factor": 2,
    },
    "base": {
        "name": "Base",
        "symbol": "ETH",
        "block_time": "2s",
        "data_percent": "5%",
        "priority": "MEDIUM",
        "ttl_days": 60,
        "replication_factor": 2,
    },
    "polygon": {
        "name": "Polygon PoS",
        "symbol": "MATIC",
        "block_time": "2s",
        "data_percent": "8%",
        "priority": "MEDIUM",
        "ttl_days": 60,
        "replication_factor": 2,
    },
    "avax": {
        "name": "Avalanche C-Chain",
        "symbol": "AVAX",
        "block_time": "2s",
        "data_percent": "4%",
        "priority": "MEDIUM",
        "ttl_days": 60,
        "replication_factor": 2,
    },
    "xlayer": {
        "name": "X Layer",
        "symbol": "OKB",
        "block_time": "2s",
        "data_percent": "2%",
        "priority": "LOW",
        "ttl_days": 30,
        "replication_factor": 1,
    },
}

TEMPLATE = """-- ============================================================
-- {name} ({symbol}) — Keyspace: chain_bd_{chain}
-- Block time: {block_time} | Data: ~{data_percent} of total | Priority: {priority}
-- Retention: {ttl_days} days raw, forever aggregated
-- ============================================================

CREATE KEYSPACE IF NOT EXISTS chain_bd_{chain}
WITH replication = {{'class': 'NetworkTopologyStrategy', 'datacenter1': {replication_factor}}}
AND durable_writes = true;

USE chain_bd_{chain};

-- BLOCKS (time-bucketed by day)
CREATE TABLE IF NOT EXISTS blocks_by_day (
    day date,
    block_number bigint,
    block_hash text,
    parent_hash text,
    timestamp timestamp,
    tx_count int,
    gas_used bigint,
    gas_limit bigint,
    base_fee bigint,
    PRIMARY KEY ((day), block_number)
) WITH CLUSTERING ORDER BY (block_number DESC)
   AND compaction = {{'class': 'TimeWindowCompactionStrategy', 'compaction_window_unit': 'DAYS', 'compaction_window_size': 1}}
   AND default_time_to_live = {ttl_seconds}
   AND gc_grace_seconds = 86400;

-- TRANSACTIONS (bucketed by address + week)
CREATE TABLE IF NOT EXISTS transactions_by_address (
    address_bucket int,
    address text,
    week text,
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
    method_id text,
    PRIMARY KEY ((address_bucket, address, week), block_number, tx_index)
) WITH CLUSTERING ORDER BY (block_number DESC, tx_index DESC)
   AND compaction = {{'class': 'TimeWindowCompactionStrategy', 'compaction_window_unit': 'DAYS', 'compaction_window_size': 7}}
   AND default_time_to_live = {ttl_seconds};

-- TRANSACTIONS (by hash)
CREATE TABLE IF NOT EXISTS transactions_by_hash (
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
    PRIMARY KEY ((tx_hash))
) WITH default_time_to_live = {ttl_seconds};

-- TOKEN TRANSFERS (bucketed by address + week)
CREATE TABLE IF NOT EXISTS token_transfers_by_address (
    address_bucket int,
    address text,
    week text,
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
    PRIMARY KEY ((address_bucket, address, week), block_number, log_index)
) WITH CLUSTERING ORDER BY (block_number DESC, log_index DESC)
   AND compaction = {{'class': 'TimeWindowCompactionStrategy', 'compaction_window_unit': 'DAYS', 'compaction_window_size': 7}}
   AND default_time_to_live = {ttl_seconds};

-- TOKEN TRANSFERS (by token contract)
CREATE TABLE IF NOT EXISTS token_transfers_by_token (
    token_bucket int,
    token_address text,
    day date,
    block_number bigint,
    log_index int,
    tx_hash text,
    from_address text,
    to_address text,
    value varint,
    timestamp timestamp,
    PRIMARY KEY ((token_bucket, token_address, day), block_number, log_index)
) WITH CLUSTERING ORDER BY (block_number DESC, log_index DESC)
   AND default_time_to_live = 2592000;

-- WALLETS (aggregated profiles, no TTL)
CREATE TABLE IF NOT EXISTS wallets (
    address_bucket int,
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
    wallet_type text,
    wallet_tier text,
    risk_score float,
    confidence float,
    is_contract boolean,
    tags set<text>,
    reviewed boolean,
    reviewed_by text,
    reviewed_at timestamp,
    review_notes text,
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
    tags set<text>,
    PRIMARY KEY ((wallet_type, wallet_tier), risk_score, address)
) WITH CLUSTERING ORDER BY (risk_score DESC, address ASC);

-- WALLETS BY ACTIVITY
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
   AND default_time_to_live = {ttl_seconds};

-- LABELS
CREATE TABLE IF NOT EXISTS labels (
    address_bucket int,
    address text,
    label text,
    category text,
    source text,
    added_at timestamp,
    added_by text,
    PRIMARY KEY ((address_bucket, address))
);

-- LABELS BY CATEGORY
CREATE TABLE IF NOT EXISTS labels_by_category (
    category text,
    address text,
    label text,
    source text,
    added_at timestamp,
    PRIMARY KEY ((category), address)
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

-- TOKEN METADATA
CREATE TABLE IF NOT EXISTS token_metadata (
    token_address text,
    name text,
    symbol text,
    decimals tinyint,
    total_supply varint,
    holders_count bigint,
    logo_url text,
    updated_at timestamp,
    PRIMARY KEY ((token_address))
);

-- DAILY STATS
CREATE TABLE IF NOT EXISTS daily_stats (
    year_month text,
    date date,
    total_tx bigint,
    total_blocks int,
    unique_wallets bigint,
    total_gas_used varint,
    avg_gas_price bigint,
    total_value varint,
    new_wallets bigint,
    active_wallets bigint,
    PRIMARY KEY ((year_month), date)
) WITH CLUSTERING ORDER BY (date DESC);

-- HOURLY STATS
CREATE TABLE IF NOT EXISTS hourly_stats (
    day date,
    hour timestamp,
    total_tx bigint,
    total_blocks int,
    unique_wallets bigint,
    total_gas_used varint,
    avg_gas_price bigint,
    total_value varint,
    PRIMARY KEY ((day), hour)
) WITH CLUSTERING ORDER BY (hour DESC)
   AND default_time_to_live = 2592000;
"""

if __name__ == "__main__":
    import os
    
    os.makedirs("chains", exist_ok=True)
    
    for chain, config in EVM_CHAINS.items():
        filename = f"chains/init_chain_bd_{chain}.cql"
        ttl_seconds = config["ttl_days"] * 86400
        
        content = TEMPLATE.format(
            chain=chain,
            name=config["name"],
            symbol=config["symbol"],
            block_time=config["block_time"],
            data_percent=config["data_percent"],
            priority=config["priority"],
            ttl_days=config["ttl_days"],
            ttl_seconds=ttl_seconds,
            replication_factor=config["replication_factor"],
        )
        
        with open(filename, "w") as f:
            f.write(content)
        
        print(f"[OK] Generated {filename}")
    
    print(f"\n[OK] Generated {len(EVM_CHAINS)} EVM chain schemas")
