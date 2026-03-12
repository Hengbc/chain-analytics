# Blockchain Data Structure Differences

**Key Point:** Different blockchains = Different transaction models = Different database schemas

---

## Three Main Categories

### 1. EVM Chains (Account-Based + Smart Contracts)
**Chains:** ETH, BNB, ARB, OP, BASE, POLYGON, AVAX, XLAYER

**Transaction Model:**
- Account-based (addresses with balances)
- Gas fees (gwei)
- Smart contracts with bytecode
- ERC-20/721/1155 tokens
- Transaction has: from, to, value, gas, input data

**Similar enough to share schema** (with minor tweaks per chain)

---

### 2. Solana (Account-Based + Programs)
**Chain:** SOL

**Transaction Model:**
- Account-based but different
- **Slots** instead of block numbers
- **Instructions** instead of function calls
- **Lamports** instead of wei (1 SOL = 1B lamports)
- **Programs** instead of contracts
- SPL tokens (not ERC-20)
- **Signatures** instead of tx hashes
- Multiple instructions per transaction

**Needs completely different schema**

---

### 3. Bitcoin (UTXO-Based)
**Chain:** BTC

**Transaction Model:**
- **UTXO model** (unspent transaction outputs)
- No "accounts" or "balances" - only UTXOs
- **Inputs + Outputs** (not from/to)
- No smart contracts
- **Satoshis** (1 BTC = 100M sats)
- No gas, just transaction fees
- Script-based (not bytecode)

**Needs completely different schema**

---

## Schema Comparison

### EVM Chains (ETH, BNB, ARB, etc.)

```sql
CREATE TABLE transactions_by_address (
    address_bucket int,
    address text,
    week text,
    block_number bigint,
    tx_index int,
    tx_hash text,
    from_address text,          -- Sender account
    to_address text,            -- Receiver account (or contract)
    value varint,               -- Wei (18 decimals)
    gas_price bigint,           -- Gas price in wei
    gas_used bigint,            -- Gas consumed
    status tinyint,             -- 1 = success, 0 = fail
    timestamp timestamp,
    method_id text,             -- First 4 bytes of input data
    PRIMARY KEY ((address_bucket, address, week), block_number, tx_index)
);

CREATE TABLE token_transfers (
    -- ERC-20 Transfer events from logs
    address_bucket int,
    address text,
    week text,
    block_number bigint,
    log_index int,
    tx_hash text,
    token_address text,         -- Contract address
    from_address text,
    to_address text,
    value varint,
    token_symbol text,
    token_decimals tinyint,
    timestamp timestamp,
    PRIMARY KEY ((address_bucket, address, week), block_number, log_index)
);
```

**Key fields:**
- `block_number` (sequential)
- `tx_hash` (0x...)
- `gas_price`, `gas_used`
- `from_address`, `to_address`
- `value` in wei

---

### Solana (Different Model)

```sql
CREATE TABLE transactions_by_address (
    address_bucket int,
    address text,
    day date,                   -- Day bucket (not week - high volume)
    slot bigint,                -- NOT block_number
    tx_index int,
    signature text,             -- NOT tx_hash (base58 encoded)
    signer text,                -- Fee payer
    instructions frozen<list<text>>,  -- Multiple instructions per tx
    accounts frozen<list<text>>,      -- All involved accounts
    lamports_in bigint,         -- SOL received (NOT wei)
    lamports_out bigint,        -- SOL sent
    fee bigint,                 -- Transaction fee in lamports
    status text,                -- "success" or error message
    timestamp timestamp,
    PRIMARY KEY ((address_bucket, address, day), slot, tx_index)
);

CREATE TABLE spl_token_transfers (
    -- SPL token transfers (NOT ERC-20)
    address_bucket int,
    address text,
    day date,
    slot bigint,
    tx_index int,
    signature text,
    mint text,                  -- Token mint address (NOT "token_address")
    from_address text,
    to_address text,
    amount bigint,              -- Raw amount (use decimals separately)
    decimals tinyint,
    timestamp timestamp,
    PRIMARY KEY ((address_bucket, address, day), slot, tx_index)
);

CREATE TABLE programs (
    -- Programs (NOT "contracts")
    program_address text,
    name text,
    type text,                  -- "native" | "bpf" | "spl"
    is_executable boolean,
    owner text,
    data_size bigint,
    PRIMARY KEY ((program_address))
);
```

**Key differences:**
- `slot` instead of `block_number`
- `signature` instead of `tx_hash`
- `lamports` instead of `wei`
- `instructions` list (not single method_id)
- `mint` instead of `token_address`
- `programs` instead of `contracts`

---

### Bitcoin (UTXO Model)

```sql
CREATE TABLE transactions_by_address (
    address_bucket int,
    address text,
    month text,                 -- Month bucket (BTC is slower)
    block_height bigint,        -- Block height
    tx_index int,
    txid text,                  -- Transaction ID (NOT tx_hash format)
    inputs frozen<list<frozen<map<text, text>>>>,   -- Complex UTXO inputs
    outputs frozen<list<frozen<map<text, text>>>>,  -- Complex UTXO outputs
    value_in bigint,            -- Total satoshis in
    value_out bigint,           -- Total satoshis out
    fee bigint,                 -- Mining fee (sats)
    timestamp timestamp,
    PRIMARY KEY ((address_bucket, address, month), block_height, tx_index)
);

-- Example input/output structure:
-- inputs: [
--   {"txid": "abc123...", "vout": 0, "value": 50000000, "address": "1A1z..."}
-- ]
-- outputs: [
--   {"value": 25000000, "address": "1B2x...", "script": "..."}
-- ]

CREATE TABLE utxos (
    -- Unspent Transaction Outputs (unique to Bitcoin)
    address_bucket int,
    address text,
    txid text,
    vout int,                   -- Output index
    value bigint,               -- Satoshis
    script text,                -- Locking script
    block_height bigint,
    spent boolean,              -- False = unspent (can be used)
    spent_in_txid text,         -- If spent, which tx used it
    timestamp timestamp,
    PRIMARY KEY ((address_bucket, address), txid, vout)
);

-- NO token_transfers table (Bitcoin has no native tokens)
-- NO contracts table (Bitcoin has no smart contracts)
```

**Key differences:**
- **UTXO model** - no "from/to" like EVM
- `inputs` and `outputs` arrays (complex structure)
- `satoshis` instead of wei
- `txid` format (Bitcoin-specific)
- `block_height` (not always sequential due to forks)
- **UTXOs table** (unique to Bitcoin)
- **No smart contracts**
- **No token system** (Layer 2 tokens exist but not on base chain)

---

## Wallet Aggregation Differences

### EVM Chains
```sql
CREATE TABLE wallets (
    address_bucket int,
    address text,
    tx_count bigint,
    total_value_in varint,      -- Wei
    total_value_out varint,     -- Wei
    token_count int,            -- ERC-20 tokens held
    gas_spent varint,           -- Total gas in wei
    is_contract boolean,
    -- ...
);
```

### Solana
```sql
CREATE TABLE wallets (
    address_bucket int,
    address text,
    tx_count bigint,
    lamports_in bigint,         -- NOT varint (no huge numbers)
    lamports_out bigint,
    current_balance bigint,     -- Lamports
    spl_token_count int,        -- SPL tokens held
    is_program boolean,         -- NOT is_contract
    -- ...
);
```

### Bitcoin
```sql
CREATE TABLE wallets (
    address_bucket int,
    address text,
    tx_count bigint,
    total_received bigint,      -- Total sats ever received
    total_sent bigint,          -- Total sats ever sent
    current_balance bigint,     -- Sum of UTXOs
    utxo_count int,             -- Number of unspent outputs
    first_tx timestamp,
    last_tx timestamp,
    -- NO token_count (Bitcoin has no tokens)
    -- NO gas_spent (Bitcoin has no gas)
    -- NO is_contract (Bitcoin has no contracts)
);
```

---

## Token/Asset Differences

| Chain Type | Token Standard | How Stored |
|------------|---------------|------------|
| **EVM** | ERC-20, ERC-721, ERC-1155 | Contract state + event logs |
| **Solana** | SPL Token | Program-owned accounts |
| **Bitcoin** | None (base layer) | N/A |

### EVM Token Metadata
```sql
CREATE TABLE token_metadata (
    token_address text,         -- Contract address
    name text,
    symbol text,
    decimals tinyint,           -- Usually 18
    total_supply varint,
    -- ...
);
```

### Solana Token Metadata
```sql
CREATE TABLE token_metadata (
    mint text,                  -- Mint address (NOT "token_address")
    name text,
    symbol text,
    decimals tinyint,           -- Usually 6-9
    supply bigint,              -- Current supply
    mint_authority text,        -- Who can mint more
    freeze_authority text,      -- Who can freeze accounts
    -- ...
);
```

### Bitcoin
**No token metadata table** (no native tokens)

---

## Block Structure Differences

### EVM Chains
```sql
CREATE TABLE blocks_by_day (
    day date,
    block_number bigint,        -- Sequential
    block_hash text,
    parent_hash text,
    timestamp timestamp,
    tx_count int,
    gas_used bigint,
    gas_limit bigint,
    base_fee bigint,            -- EIP-1559 (post-London fork)
    miner text,                 -- Block producer
    -- ...
);
```

### Solana
```sql
CREATE TABLE blocks_by_hour (
    hour timestamp,
    slot bigint,                -- NOT block_number
    block_hash text,
    parent_slot bigint,
    timestamp timestamp,
    tx_count int,
    leader text,                -- Validator (NOT "miner")
    -- NO gas fields (Solana has fixed fees)
);
```

### Bitcoin
```sql
CREATE TABLE blocks_by_day (
    day date,
    block_height bigint,        -- Height (can have forks)
    block_hash text,
    prev_block_hash text,
    timestamp timestamp,
    tx_count int,
    size_bytes bigint,          -- Block size
    weight bigint,              -- SegWit weight
    difficulty varint,          -- Mining difficulty
    nonce bigint,               -- Proof of work nonce
    -- NO gas fields
);
```

---

## Updated Schema Files Needed

### Current Files (Need Updating)

❌ **Old approach:** Same schema for all chains  
✅ **New approach:** Custom schema per chain type

### New Schema Structure

```
scripts/chains/
├── evm/
│   ├── base_schema.cql         (Shared EVM tables)
│   ├── init_eth.cql            (ETH-specific: includes base + custom)
│   ├── init_bnb.cql
│   ├── init_arb.cql
│   └── ...
├── solana/
│   └── init_solana.cql         (Completely different structure)
├── bitcoin/
│   └── init_bitcoin.cql        (UTXO model)
└── generate_schemas.py         (Updated script)
```

---

## Backend Code: Chain-Specific Logic

```python
# app/chains.py

class ChainType(Enum):
    EVM = "evm"
    SOLANA = "solana"
    BITCOIN = "bitcoin"

CHAIN_TYPES = {
    "eth": ChainType.EVM,
    "bnb": ChainType.EVM,
    "arb": ChainType.EVM,
    # ...
    "solana": ChainType.SOLANA,
    "btc": ChainType.BITCOIN,
}

def get_chain_type(chain: str) -> ChainType:
    return CHAIN_TYPES.get(chain, ChainType.EVM)

# app/indexer.py

async def index_transaction(chain: str, tx_data: dict):
    chain_type = get_chain_type(chain)
    
    if chain_type == ChainType.EVM:
        return await index_evm_transaction(chain, tx_data)
    elif chain_type == ChainType.SOLANA:
        return await index_solana_transaction(tx_data)
    elif chain_type == ChainType.BITCOIN:
        return await index_bitcoin_transaction(tx_data)
```

---

## Summary: Schema Per Chain Type

| Chain Type | Chains | Schema File | Key Differences |
|------------|--------|-------------|-----------------|
| **EVM** | ETH, BNB, ARB, OP, BASE, POLYGON, AVAX, XLAYER | `evm/init_{chain}.cql` | Similar structure, minor tweaks |
| **Solana** | SOL | `solana/init_solana.cql` | Slots, instructions, lamports, SPL |
| **Bitcoin** | BTC | `bitcoin/init_bitcoin.cql` | UTXOs, inputs/outputs, no contracts |

---

## Next Steps

1. ✅ Recognize different chain architectures
2. ⏳ Create separate schema templates per chain type
3. ⏳ Update backend to handle each type
4. ⏳ Build chain-specific indexers

**Want me to generate the corrected schema files now?**
