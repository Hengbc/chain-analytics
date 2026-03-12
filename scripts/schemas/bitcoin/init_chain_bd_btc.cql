-- ============================================================
-- BITCOIN BLOCKCHAIN SCHEMA
-- Keyspace: chain_bd_btc
-- Model: UTXO (Unspent Transaction Output) - NOT account-based
-- Units: Satoshis (1 BTC = 100,000,000 satoshis)
-- Block: Block height (can have forks/orphans)
-- Tx ID: txid (Bitcoin-specific format)
-- NO smart contracts, NO tokens, NO gas
-- ============================================================

CREATE KEYSPACE IF NOT EXISTS chain_bd_btc
WITH replication = {'class': 'NetworkTopologyStrategy', 'datacenter1': 2}
AND durable_writes = true;

USE chain_bd_btc;

-- ────────────────────────────────────────────
-- 1. BLOCKS (month-bucketed, Bitcoin is slower)
-- Bitcoin: ~1 block every 10 minutes = ~144 blocks/day
-- ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS blocks_by_month (
    year_month text,            -- YYYY-MM bucket
    block_height bigint,        -- Block height (can have reorgs)
    block_hash text,
    prev_block_hash text,
    timestamp timestamp,
    tx_count int,
    size_bytes bigint,          -- Block size in bytes
    weight bigint,              -- SegWit weight units
    difficulty varint,          -- Mining difficulty
    nonce bigint,               -- Proof-of-work nonce
    version int,
    merkle_root text,
    bits text,                  -- Difficulty target
    PRIMARY KEY ((year_month), block_height)
) WITH CLUSTERING ORDER BY (block_height DESC)
   AND compaction = {'class': 'LeveledCompactionStrategy'};  -- NO TTL, keep forever

-- ────────────────────────────────────────────
-- 2. TRANSACTIONS (bucketed by address + month)
-- Bitcoin UTXO model: inputs + outputs, NOT from/to
-- ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS transactions_by_address (
    address_bucket int,         -- hash(address) % 1000
    address text,
    month text,                 -- YYYY-MM (monthly buckets for BTC)
    block_height bigint,
    tx_index int,
    txid text,                  -- Bitcoin transaction ID
    -- UTXO inputs (what's being spent)
    inputs frozen<list<frozen<map<text, text>>>>,
    -- Example: [{"txid": "abc123...", "vout": 0, "value": 50000000, "address": "1A1z..."}]
    -- UTXO outputs (what's being created)
    outputs frozen<list<frozen<map<text, text>>>>,
    -- Example: [{"value": 25000000, "address": "1B2x...", "script_type": "P2PKH"}]
    value_in bigint,            -- Total satoshis in
    value_out bigint,           -- Total satoshis out
    fee bigint,                 -- Mining fee (value_in - value_out)
    is_coinbase boolean,        -- Is this a coinbase (mining reward) tx
    timestamp timestamp,
    PRIMARY KEY ((address_bucket, address, month), block_height, tx_index)
) WITH CLUSTERING ORDER BY (block_height DESC, tx_index DESC)
   AND compaction = {'class': 'LeveledCompactionStrategy'};

-- ────────────────────────────────────────────
-- 3. TRANSACTIONS (by txid for direct lookup)
-- ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS transactions_by_txid (
    txid text,
    block_height bigint,
    tx_index int,
    inputs frozen<list<frozen<map<text, text>>>>,
    outputs frozen<list<frozen<map<text, text>>>>,
    value_in bigint,
    value_out bigint,
    fee bigint,
    is_coinbase boolean,
    timestamp timestamp,
    PRIMARY KEY ((txid))
);

-- ────────────────────────────────────────────
-- 4. UTXOs (Unspent Transaction Outputs)
-- THIS TABLE IS UNIQUE TO BITCOIN
-- Tracks which outputs haven't been spent yet
-- ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS utxos (
    address_bucket int,
    address text,
    txid text,                  -- Transaction that created this output
    vout int,                   -- Output index in transaction
    value bigint,               -- Satoshis
    script_pub_key text,        -- Locking script
    script_type text,           -- P2PKH | P2SH | P2WPKH | P2WSH | P2TR
    block_height bigint,
    spent boolean,              -- False = unspent (can be used as input)
    spent_in_txid text,         -- If spent, which tx used it
    spent_at_height bigint,     -- Block height when spent
    timestamp timestamp,
    PRIMARY KEY ((address_bucket, address), txid, vout)
);

-- ────────────────────────────────────────────
-- 5. WALLETS (aggregated from UTXO history)
-- Bitcoin: no "balances", only sum of UTXOs
-- ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS wallets (
    address_bucket int,
    address text,
    address_type text,          -- P2PKH | P2SH | P2WPKH | P2WSH | P2TR
    first_tx timestamp,
    last_tx timestamp,
    tx_count bigint,
    tx_in_count bigint,         -- Times this address was in an input
    tx_out_count bigint,        -- Times this address was in an output
    total_received bigint,      -- Total satoshis ever received
    total_sent bigint,          -- Total satoshis ever sent
    current_balance bigint,     -- Sum of unspent UTXOs
    utxo_count int,             -- Number of unspent outputs
    largest_tx bigint,          -- Largest single transaction (sats)
    -- Classification
    wallet_type text,           -- user | exchange | miner | unknown
    wallet_tier text,           -- whale | shark | dolphin | shrimp
    risk_score float,
    tags set<text>,
    -- Review
    reviewed boolean,
    reviewed_by text,
    reviewed_at timestamp,
    review_notes text,
    updated_at timestamp,
    PRIMARY KEY ((address_bucket, address))
);

-- ────────────────────────────────────────────
-- 6. WALLETS BY TYPE
-- ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS wallets_by_type (
    wallet_type text,
    wallet_tier text,
    risk_score float,
    address text,
    tx_count bigint,
    current_balance bigint,
    updated_at timestamp,
    tags set<text>,
    PRIMARY KEY ((wallet_type, wallet_tier), risk_score, address)
) WITH CLUSTERING ORDER BY (risk_score DESC, address ASC);

-- ────────────────────────────────────────────
-- 7. WALLETS BY ACTIVITY
-- ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS wallets_by_activity (
    month text,                 -- Monthly for BTC (lower volume)
    updated_at timestamp,
    address text,
    wallet_type text,
    wallet_tier text,
    risk_score float,
    tx_count bigint,
    tags set<text>,
    PRIMARY KEY ((month), updated_at, address)
) WITH CLUSTERING ORDER BY (updated_at DESC, address ASC);

-- ────────────────────────────────────────────
-- 8. LABELS
-- ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS labels (
    address_bucket int,
    address text,
    label text,
    category text,              -- exchange | miner | scam | darknet | etc
    source text,
    added_at timestamp,
    added_by text,
    PRIMARY KEY ((address_bucket, address))
);

-- ────────────────────────────────────────────
-- 9. LABELS BY CATEGORY
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
-- 10. INDEXER STATE
-- ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS indexer_state (
    shard int,
    last_block_height bigint,   -- NOT "last_block" (can have reorgs)
    last_block_hash text,
    last_block_timestamp timestamp,
    blocks_indexed_today bigint,
    tx_indexed_today bigint,
    updated_at timestamp,
    status text,
    error_message text,
    PRIMARY KEY ((shard))
);

-- ────────────────────────────────────────────
-- 11. DAILY STATS
-- ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS daily_stats (
    year_month text,
    date date,
    total_tx bigint,
    total_blocks int,
    unique_addresses bigint,
    total_value bigint,         -- Total satoshis moved
    total_fees bigint,          -- Mining fees
    avg_fee bigint,
    avg_tx_size int,            -- Average tx size in bytes
    new_addresses bigint,
    PRIMARY KEY ((year_month), date)
) WITH CLUSTERING ORDER BY (date DESC);

-- ────────────────────────────────────────────
-- 12. MINING STATS (Bitcoin-specific)
-- ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS mining_stats (
    year_month text,
    date date,
    blocks_mined int,
    total_rewards bigint,       -- Block rewards + fees
    difficulty varint,
    hashrate_estimate bigint,
    PRIMARY KEY ((year_month), date)
) WITH CLUSTERING ORDER BY (date DESC);

-- ════════════════════════════════════════════════════════════
-- NOTES:
-- 1. NO "token_transfers" table (Bitcoin has no native tokens)
-- 2. NO "contracts" table (Bitcoin has no smart contracts)
-- 3. NO "gas" fields (Bitcoin uses simple fee-per-byte)
-- 4. UTXOs table is unique to Bitcoin's model
-- 5. NO TTL - Bitcoin data has historical/archive value
-- ════════════════════════════════════════════════════════════
