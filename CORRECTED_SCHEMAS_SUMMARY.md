# Corrected Blockchain Schemas — Respecting Chain Differences

**Status:** ✅ COMPLETE — Chain-Specific Schemas Generated

---

## What Changed

### ❌ Old Approach (Wrong)
- **Same schema for all chains**
- Assumed all blockchains work like Ethereum
- Used EVM concepts everywhere (gas, contracts, ERC-20)

### ✅ New Approach (Correct)
- **Three schema types:**
  1. **EVM chains** — Similar structure with minor tweaks
  2. **Solana** — Completely different (slots, signatures, SPL)
  3. **Bitcoin** — UTXO model (inputs/outputs, no contracts)

---

## Schema Types

### 1. EVM Chains (8 chains)

**Chains:** ETH, BNB, ARB, OP, BASE, POLYGON, AVAX, XLAYER

**Common characteristics:**
- Account-based model
- Transactions have: `from`, `to`, `value`, `gas_price`, `gas_used`
- Smart contracts with bytecode
- ERC-20/721/1155 tokens via event logs
- Block numbers (sequential)
- Transaction hashes (0x...)

**Schema file:** `schemas/evm/base_evm_schema.cql` (template)

**Generated files:**
```
schemas/generated/
├── init_chain_bd_eth.cql      (90-day TTL, RF=3)
├── init_chain_bd_bnb.cql      (90-day TTL, RF=3)
├── init_chain_bd_arb.cql      (60-day TTL, RF=2)
├── init_chain_bd_op.cql       (60-day TTL, RF=2)
├── init_chain_bd_base.cql     (60-day TTL, RF=2)
├── init_chain_bd_polygon.cql  (60-day TTL, RF=2)
├── init_chain_bd_avax.cql     (60-day TTL, RF=2)
└── init_chain_bd_xlayer.cql   (30-day TTL, RF=1)
```

**Key tables:**
- `blocks_by_day` — Block metadata with gas fields
- `transactions_by_address` — from/to/value/gas model
- `token_transfers_by_address` — ERC-20/721 events
- `contracts` — Smart contract registry
- `wallets` — Aggregated with gas_spent, is_contract

---

### 2. Solana (1 chain)

**Chain:** SOL

**Unique characteristics:**
- **Slots** instead of block numbers
- **Signatures** (base58) instead of tx hashes (0x...)
- **Lamports** (1 SOL = 1B lamports) instead of wei
- **Instructions** list instead of single method call
- **Programs** instead of contracts
- **SPL tokens** instead of ERC-20
- No gas — fixed fees per signature
- ~2 blocks/second = very high throughput

**Schema file:** `schemas/solana/init_chain_bd_solana.cql`

**Generated file:** `schemas/generated/init_chain_bd_solana.cql`

**Key tables:**
- `blocks_by_hour` — **Hour-bucketed** (not day, too fast)
- `transactions_by_address` — Uses `slot`, `signature`, `instructions`, `lamports`
- `spl_token_transfers_by_address` — SPL tokens (not ERC-20)
- `programs` — Executable accounts (not contracts)
- `wallets` — Aggregated with `lamports_in`, `is_program`

**Key differences from EVM:**
```sql
-- EVM
CREATE TABLE transactions_by_address (
    block_number bigint,
    tx_hash text,
    from_address text,
    to_address text,
    value varint,              -- wei
    gas_price bigint,
    gas_used bigint,
    ...
);

-- Solana
CREATE TABLE transactions_by_address (
    slot bigint,               -- NOT block_number
    signature text,            -- NOT tx_hash
    signer text,               -- NOT from_address
    instructions frozen<list<text>>,  -- Multiple per tx
    lamports_in bigint,        -- NOT value/wei
    lamports_out bigint,
    fee bigint,                -- NOT gas
    ...
);
```

---

### 3. Bitcoin (1 chain)

**Chain:** BTC

**Unique characteristics:**
- **UTXO model** — No accounts, no balances
- **Inputs + Outputs** — Not from/to
- **Satoshis** (1 BTC = 100M sats)
- **txid** (Bitcoin-specific format)
- No smart contracts
- No tokens
- No gas (just fee-per-byte)
- ~1 block every 10 minutes (slow)

**Schema file:** `schemas/bitcoin/init_chain_bd_btc.cql`

**Generated file:** `schemas/generated/init_chain_bd_btc.cql`

**Key tables:**
- `blocks_by_month` — **Month-bucketed** (BTC is slow)
- `transactions_by_address` — Uses `inputs`/`outputs` arrays
- `utxos` — **Unique to Bitcoin** — tracks unspent outputs
- `wallets` — Aggregated with `total_received`, `total_sent`, `utxo_count`
- **NO** `token_transfers` table (no tokens)
- **NO** `contracts` table (no smart contracts)
- **NO** gas fields anywhere

**Key differences from EVM:**
```sql
-- EVM
CREATE TABLE transactions_by_address (
    from_address text,
    to_address text,
    value varint,
    ...
);

-- Bitcoin (UTXO model)
CREATE TABLE transactions_by_address (
    inputs frozen<list<frozen<map<text, text>>>>,   -- Complex structure
    outputs frozen<list<frozen<map<text, text>>>>,
    value_in bigint,           -- Total sats in
    value_out bigint,          -- Total sats out
    fee bigint,                -- Difference
    ...
);

-- Bitcoin also has UTXO table (unique)
CREATE TABLE utxos (
    txid text,
    vout int,
    value bigint,
    spent boolean,             -- Key field
    spent_in_txid text,
    ...
);
```

---

## File Structure

```
scripts/
├── schemas/
│   ├── evm/
│   │   └── base_evm_schema.cql      (Template for 8 EVM chains)
│   ├── solana/
│   │   └── init_chain_bd_solana.cql (Solana-specific)
│   ├── bitcoin/
│   │   └── init_chain_bd_btc.cql    (Bitcoin UTXO model)
│   └── generated/                    (Output directory)
│       ├── init_chain_bd_eth.cql
│       ├── init_chain_bd_bnb.cql
│       ├── init_chain_bd_arb.cql
│       ├── init_chain_bd_op.cql
│       ├── init_chain_bd_base.cql
│       ├── init_chain_bd_polygon.cql
│       ├── init_chain_bd_avax.cql
│       ├── init_chain_bd_xlayer.cql
│       ├── init_chain_bd_solana.cql
│       └── init_chain_bd_btc.cql
├── generate_corrected_schemas.py    (Schema generator)
└── init_all_corrected_schemas.ps1   (Deployment script)
```

---

## How to Use

### 1. Generate Schemas

```bash
cd C:\Users\Administrator\Desktop\chain-analytics\scripts
python generate_corrected_schemas.py
```

Output: 10 schema files in `schemas/generated/`

### 2. Deploy to ScyllaDB

**Windows:**
```powershell
.\init_all_corrected_schemas.ps1
```

**Linux/Mac:**
```bash
chmod +x init_all_corrected_schemas.sh
./init_all_corrected_schemas.sh
```

**Manual (one by one):**
```bash
docker exec chain-analytics-scylla cqlsh -f /scripts/schemas/generated/init_chain_bd_eth.cql
docker exec chain-analytics-scylla cqlsh -f /scripts/schemas/generated/init_chain_bd_solana.cql
docker exec chain-analytics-scylla cqlsh -f /scripts/schemas/generated/init_chain_bd_btc.cql
# ...
```

### 3. Verify Deployment

```bash
# List all keyspaces
docker exec chain-analytics-scylla cqlsh -e "DESC KEYSPACES"

# Check EVM chain (Ethereum)
docker exec chain-analytics-scylla cqlsh -e "USE chain_bd_eth; DESC TABLES;"

# Check Solana (different structure)
docker exec chain-analytics-scylla cqlsh -e "USE chain_bd_solana; DESC TABLES;"

# Check Bitcoin (UTXO model)
docker exec chain-analytics-scylla cqlsh -e "USE chain_bd_btc; DESC TABLES;"
```

---

## Backend Updates Needed

### 1. Chain Type Detection

```python
# app/chains.py
from enum import Enum

class ChainType(Enum):
    EVM = "evm"
    SOLANA = "solana"
    BITCOIN = "bitcoin"

CHAIN_TYPES = {
    "eth": ChainType.EVM,
    "bnb": ChainType.EVM,
    "arb": ChainType.EVM,
    "op": ChainType.EVM,
    "base": ChainType.EVM,
    "polygon": ChainType.EVM,
    "avax": ChainType.EVM,
    "xlayer": ChainType.EVM,
    "solana": ChainType.SOLANA,
    "btc": ChainType.BITCOIN,
}

def get_chain_type(chain: str) -> ChainType:
    return CHAIN_TYPES.get(chain, ChainType.EVM)
```

### 2. Chain-Specific Indexers

```python
# app/services/indexer.py

async def index_transaction(chain: str, data: dict):
    chain_type = get_chain_type(chain)
    
    if chain_type == ChainType.EVM:
        return await index_evm_transaction(chain, data)
    elif chain_type == ChainType.SOLANA:
        return await index_solana_transaction(data)
    elif chain_type == ChainType.BITCOIN:
        return await index_bitcoin_transaction(data)

async def index_evm_transaction(chain: str, tx: dict):
    # EVM: from/to, value in wei, gas
    session = get_session(chain)
    session.execute("""
        INSERT INTO transactions_by_address
        (address_bucket, address, week, block_number, tx_index,
         tx_hash, from_address, to_address, value, gas_price, ...)
        VALUES (...)
    """)

async def index_solana_transaction(tx: dict):
    # Solana: slot, signature, instructions, lamports
    session = get_session("solana")
    session.execute("""
        INSERT INTO transactions_by_address
        (address_bucket, address, day, slot, tx_index,
         signature, signer, instructions, lamports_in, ...)
        VALUES (...)
    """)

async def index_bitcoin_transaction(tx: dict):
    # Bitcoin: inputs/outputs UTXO model
    session = get_session("btc")
    session.execute("""
        INSERT INTO transactions_by_address
        (address_bucket, address, month, block_height, tx_index,
         txid, inputs, outputs, value_in, value_out, fee, ...)
        VALUES (...)
    """)
```

### 3. Query Helpers

```python
# app/services/transactions.py

async def get_address_transactions(chain: str, address: str, limit: int = 50):
    chain_type = get_chain_type(chain)
    
    if chain_type == ChainType.EVM:
        return await get_evm_transactions(chain, address, limit)
    elif chain_type == ChainType.SOLANA:
        return await get_solana_transactions(address, limit)
    elif chain_type == ChainType.BITCOIN:
        return await get_bitcoin_transactions(address, limit)

async def get_evm_transactions(chain: str, address: str, limit: int):
    session = get_session(chain)
    bucket = get_address_bucket(address)
    week = get_current_week()
    
    result = session.execute("""
        SELECT tx_hash, from_address, to_address, value, gas_used
        FROM transactions_by_address
        WHERE address_bucket = ? AND address = ? AND week = ?
        LIMIT ?
    """, (bucket, address, week, limit))
    
    return [format_evm_tx(row) for row in result]

async def get_solana_transactions(address: str, limit: int):
    session = get_session("solana")
    bucket = get_address_bucket(address)
    day = get_current_day()
    
    result = session.execute("""
        SELECT signature, slot, signer, instructions, lamports_in, lamports_out
        FROM transactions_by_address
        WHERE address_bucket = ? AND address = ? AND day = ?
        LIMIT ?
    """, (bucket, address, day, limit))
    
    return [format_solana_tx(row) for row in result]
```

---

## Key Takeaways

### For Management
- ✅ Each blockchain has unique data structures
- ✅ We now have specialized schemas for each type
- ✅ More accurate, faster queries
- ✅ Same cost (just better organized)

### For Developers
- ✅ Schema respects each chain's architecture
- ✅ Need chain-specific indexers
- ✅ Need chain-specific query logic
- ✅ Frontend can stay unified (API abstracts differences)

### For DBAs
- ✅ Same ScyllaDB infrastructure
- ✅ Same deployment process
- ✅ Just 10 keyspaces instead of 1
- ✅ Better query performance per chain

---

## Next Steps

1. ✅ Schemas generated
2. ⏳ Deploy to test cluster
3. ⏳ Build chain-specific indexers
4. ⏳ Update API to handle each chain type
5. ⏳ Test with real data from each chain

---

**Bottom line:** We now respect that Ethereum ≠ Solana ≠ Bitcoin. Proper data modeling for each. 🚀
