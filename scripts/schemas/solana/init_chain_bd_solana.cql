-- ============================================================
-- SOLANA BLOCKCHAIN SCHEMA
-- Keyspace: chain_bd_solana
-- Model: Account-based with Programs (not contracts)
-- Units: Lamports (1 SOL = 1,000,000,000 lamports)
-- Block: Slots (not block numbers)
-- Tx ID: Signatures (base58, not 0x hashes)
-- ============================================================

CREATE KEYSPACE IF NOT EXISTS chain_bd_solana
WITH replication = {'class': 'NetworkTopologyStrategy', 'datacenter1': 3}
AND durable_writes = true;

USE chain_bd_solana;

-- ────────────────────────────────────────────
-- 1. BLOCKS (hour-bucketed due to high throughput)
-- Solana: ~2 blocks/second = 7200 blocks/hour
-- ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS blocks_by_hour (
    hour timestamp,             -- Hour bucket (YYYY-MM-DD HH:00:00)
    slot bigint,                -- Slot number (NOT "block_number")
    block_hash text,
    parent_slot bigint,
    timestamp timestamp,
    tx_count int,
    leader text,                -- Validator address (NOT "miner")
    total_fee bigint,           -- Total fees in lamports
    PRIMARY KEY ((hour), slot)
) WITH CLUSTERING ORDER BY (slot DESC)
   AND compaction = {'class': 'TimeWindowCompactionStrategy', 'compaction_window_unit': 'HOURS', 'compaction_window_size': 1}
   AND default_time_to_live = 2592000  -- 30 days
   AND gc_grace_seconds = 86400;

-- ────────────────────────────────────────────
-- 2. TRANSACTIONS (bucketed by address + day)
-- Solana model: Multiple instructions per tx
-- ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS transactions_by_address (
    address_bucket int,         -- hash(address) % 1000
    address text,               -- Involved account
    day date,                   -- Day bucket (high volume = smaller buckets)
    slot bigint,
    tx_index int,
    signature text,             -- Base58 signature (NOT "tx_hash")
    signer text,                -- Fee payer
    instructions frozen<list<text>>,  -- Multiple instructions per tx
    accounts frozen<list<text>>,      -- All accounts involved
    program_ids frozen<list<text>>,   -- Programs called
    lamports_in bigint,         -- Lamports received
    lamports_out bigint,        -- Lamports sent
    fee bigint,                 -- Transaction fee in lamports
    status text,                -- "success" or error message
    compute_units_consumed bigint,
    timestamp timestamp,
    PRIMARY KEY ((address_bucket, address, day), slot, tx_index)
) WITH CLUSTERING ORDER BY (slot DESC, tx_index DESC)
   AND compaction = {'class': 'TimeWindowCompactionStrategy', 'compaction_window_unit': 'DAYS', 'compaction_window_size': 1}
   AND default_time_to_live = 2592000
   AND gc_grace_seconds = 86400;

-- ────────────────────────────────────────────
-- 3. TRANSACTIONS (by signature for direct lookup)
-- ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS transactions_by_signature (
    signature text,
    slot bigint,
    tx_index int,
    signer text,
    instructions frozen<list<text>>,
    accounts frozen<list<text>>,
    program_ids frozen<list<text>>,
    lamports_in bigint,
    lamports_out bigint,
    fee bigint,
    status text,
    compute_units_consumed bigint,
    timestamp timestamp,
    PRIMARY KEY ((signature))
) WITH default_time_to_live = 2592000;

-- ────────────────────────────────────────────
-- 4. SPL TOKEN TRANSFERS (NOT ERC-20)
-- SPL = Solana Program Library
-- ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS spl_token_transfers_by_address (
    address_bucket int,
    address text,
    day date,
    slot bigint,
    log_index int,
    signature text,
    mint text,                  -- Token mint address (NOT "token_address")
    from_address text,
    to_address text,
    amount bigint,              -- Raw amount
    decimals tinyint,           -- Usually 6 or 9 (NOT 18 like EVM)
    timestamp timestamp,
    PRIMARY KEY ((address_bucket, address, day), slot, log_index)
) WITH CLUSTERING ORDER BY (slot DESC, log_index DESC)
   AND compaction = {'class': 'TimeWindowCompactionStrategy', 'compaction_window_unit': 'DAYS', 'compaction_window_size': 1}
   AND default_time_to_live = 2592000;

-- ────────────────────────────────────────────
-- 5. SPL TOKEN TRANSFERS (by mint for analytics)
-- ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS spl_token_transfers_by_mint (
    mint_bucket int,            -- hash(mint) % 100
    mint text,
    day date,
    slot bigint,
    log_index int,
    signature text,
    from_address text,
    to_address text,
    amount bigint,
    timestamp timestamp,
    PRIMARY KEY ((mint_bucket, mint, day), slot, log_index)
) WITH CLUSTERING ORDER BY (slot DESC, log_index DESC)
   AND default_time_to_live = 2592000;

-- ────────────────────────────────────────────
-- 6. WALLETS (aggregated profiles)
-- Solana: lamports not wei, SPL not ERC-20
-- ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS wallets (
    address_bucket int,
    address text,
    first_seen timestamp,
    last_seen timestamp,
    tx_count bigint,
    lamports_in bigint,         -- Total lamports received (NOT wei)
    lamports_out bigint,        -- Total lamports sent
    current_balance bigint,     -- Current lamports balance
    spl_token_count int,        -- SPL tokens held (NOT ERC-20)
    nft_count int,              -- SPL NFTs
    unique_interactions int,
    total_fees_paid bigint,     -- Fees in lamports (NOT gas)
    -- Classification
    wallet_type text,           -- user | exchange | bot | program | unknown
    wallet_tier text,
    risk_score float,
    confidence float,
    is_program boolean,         -- Is this a program account (NOT "is_contract")
    program_owner text,         -- If program, who owns it
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
-- 7. WALLETS BY TYPE
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
-- 8. WALLETS BY ACTIVITY
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
   AND default_time_to_live = 2592000;

-- ────────────────────────────────────────────
-- 9. PROGRAMS (NOT "contracts")
-- Solana: Programs are executable accounts
-- ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS programs (
    address_bucket int,
    address text,               -- Program address
    program_type text,          -- native | bpf | spl
    owner text,                 -- Program owner (upgrade authority)
    deployer text,              -- Who deployed
    deployment_slot bigint,
    deployment_timestamp timestamp,
    is_executable boolean,
    data_size bigint,
    is_upgradeable boolean,
    tags set<text>,
    PRIMARY KEY ((address_bucket, address))
);

-- ────────────────────────────────────────────
-- 10. LABELS
-- ────────────────────────────────────────────
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

-- ────────────────────────────────────────────
-- 11. LABELS BY CATEGORY
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
-- 12. SPL TOKEN METADATA
-- ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS spl_token_metadata (
    mint text,                  -- Mint address
    name text,
    symbol text,
    decimals tinyint,
    supply bigint,
    mint_authority text,        -- Who can mint more
    freeze_authority text,      -- Who can freeze accounts
    is_initialized boolean,
    logo_url text,
    updated_at timestamp,
    PRIMARY KEY ((mint))
);

-- ────────────────────────────────────────────
-- 13. INDEXER STATE
-- ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS indexer_state (
    shard int,
    last_slot bigint,           -- NOT "last_block"
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
-- 14. DAILY STATS
-- ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS daily_stats (
    year_month text,
    date date,
    total_tx bigint,
    total_blocks int,
    unique_wallets bigint,
    unique_programs bigint,
    total_lamports_transferred bigint,
    total_fees bigint,
    avg_fee bigint,
    new_wallets bigint,
    active_wallets bigint,
    PRIMARY KEY ((year_month), date)
) WITH CLUSTERING ORDER BY (date DESC);

-- ────────────────────────────────────────────
-- 15. HOURLY STATS (Solana moves fast)
-- ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS hourly_stats (
    day date,
    hour timestamp,
    total_tx bigint,
    total_blocks int,
    unique_wallets bigint,
    total_lamports_transferred bigint,
    total_fees bigint,
    avg_fee bigint,
    PRIMARY KEY ((day), hour)
) WITH CLUSTERING ORDER BY (hour DESC)
   AND default_time_to_live = 2592000;
