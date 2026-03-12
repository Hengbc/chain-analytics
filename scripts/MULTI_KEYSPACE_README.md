# Multi-Keyspace Architecture — Scaling to 5 Trillion Records

## Overview

This setup splits data into **10 separate keyspaces**, one per blockchain:

```
chain_bd_eth      → Ethereum (60% of data, 90-day TTL)
chain_bd_bnb      → BNB Chain (20%, 90-day TTL)
chain_bd_arb      → Arbitrum (10%, 60-day TTL)
chain_bd_op       → Optimism (5%, 60-day TTL)
chain_bd_base     → Base (5%, 60-day TTL)
chain_bd_polygon  → Polygon (8%, 60-day TTL)
chain_bd_avax     → Avalanche (4%, 60-day TTL)
chain_bd_xlayer   → X Layer (2%, 30-day TTL)
chain_bd_solana   → Solana (15%, 30-day TTL, hour-bucketed)
chain_bd_btc      → Bitcoin (5%, NO TTL, archive forever)
```

## Why Separate Keyspaces?

### ✅ PROS

1. **Isolation** — ETH crash doesn't affect BTC
2. **Custom tuning** — Different TTL, compaction, replication per chain
3. **Independent scaling** — Allocate more nodes to ETH, fewer to XLayer
4. **Easier operations** — Drop/rebuild single chain without touching others
5. **Better replication** — Critical chains get RF=3, test chains get RF=1

### ❌ CONS

1. **More complexity** — 10 keyspaces to manage
2. **No cross-chain queries** — Can't JOIN across chains (rarely needed)
3. **Schema updates** — Need to update 10 files (automated via script)

## Key Design Changes

### 1. Bucketing Hot Addresses

**Old:**
```sql
PRIMARY KEY ((chain, address), block_number)
```

**New:**
```sql
PRIMARY KEY ((address_bucket, address, week), block_number)
address_bucket = hash(address) % 1000
```

- **1000 buckets per chain** spreads exchange wallets across nodes
- **Week bucketing** enables efficient time-based queries + TTL
- **Result:** Binance wallet txs distributed across 1000 partitions instead of 1

### 2. Time-Based Partitions

All raw data tables use time buckets:

- **Blocks:** Bucketed by `day`
- **Transactions:** Bucketed by `week`
- **Token transfers:** Bucketed by `week`
- **Stats:** Bucketed by `year_month`

**Benefits:**
- Efficient time-range queries
- TTL works at partition level (fast deletes)
- Old data automatically dropped

### 3. Denormalized Query Tables

**No secondary indexes.** Instead, maintain query-specific tables:

| Use Case | Table | Partition Key |
|----------|-------|---------------|
| List wallets by type | `wallets_by_type` | `(wallet_type, wallet_tier)` |
| Recent activity feed | `wallets_by_activity` | `(day)` |
| Token analytics | `token_transfers_by_token` | `(token_bucket, token_address, day)` |
| Filter by label category | `labels_by_category` | `(category)` |

**Trade-off:** More storage, but queries stay fast at any scale.

### 4. TTL (Time-To-Live)

| Data Type | TTL | Reason |
|-----------|-----|--------|
| Raw transactions | 30-90 days | Massive volume, rarely queried after 3 months |
| Token transfers | 30-90 days | Event data, aggregate then discard |
| Aggregated wallets | Forever | Compact, frequently queried |
| Daily stats | Forever | Small, valuable for analytics |
| Hourly stats | 30 days | Real-time dashboards only |

**Storage savings:** ~80% reduction vs keeping everything forever.

## Deployment

### 1. Generate Schemas

```bash
cd scripts
python generate_evm_schemas.py
```

This creates 7 EVM chain schemas in `chains/`.

### 2. Deploy All Chains

**Linux/Mac:**
```bash
chmod +x init_all_chains.sh
./init_all_chains.sh
```

**Windows (PowerShell):**
```powershell
.\init_all_chains.ps1
```

**Docker:**
```bash
docker exec chain-analytics-scylla cqlsh -f /scripts/chains/init_chain_bd_eth.cql
# Repeat for each chain...
```

### 3. Verify

```bash
docker exec chain-analytics-scylla cqlsh -e "DESC KEYSPACES"
docker exec chain-analytics-scylla cqlsh -e "USE chain_bd_eth; DESC TABLES;"
```

## Cluster Sizing for 5T Records

### Minimum Production Setup

**Total: 80 nodes across 10 keyspaces**

| Chain | Nodes | Storage/Node | Total Storage |
|-------|-------|--------------|---------------|
| ETH | 40 | 8TB | 320TB |
| BNB | 15 | 6TB | 90TB |
| SOL | 10 | 4TB | 40TB |
| ARB | 8 | 4TB | 32TB |
| POLYGON | 5 | 4TB | 20TB |
| Others | 2 each | 2TB | 4TB each |

**Per-node specs:**
- CPU: 32 cores
- RAM: 128GB
- Disk: NVMe SSD (8-10TB)
- Network: 10Gbps

**Total cost (AWS/GCP):** ~$40-60K/month

### Replication Strategy

```sql
-- Critical chains (ETH, BNB, SOL)
WITH replication = {'class': 'NetworkTopologyStrategy', 'datacenter1': 3}

-- Medium chains (ARB, OP, BASE, POLYGON, AVAX)
WITH replication = {'class': 'NetworkTopologyStrategy', 'datacenter1': 2}

-- Low-priority chains (XLAYER)
WITH replication = {'class': 'NetworkTopologyStrategy', 'datacenter1': 1}
```

## Backend Code Changes

The FastAPI backend needs to be updated to:

1. **Route queries to correct keyspace**
   ```python
   def get_keyspace(chain: str) -> str:
       return f"chain_bd_{chain}"
   ```

2. **Handle bucketing logic**
   ```python
   def get_address_bucket(address: str, num_buckets: int = 1000) -> int:
       return int(hashlib.sha256(address.lower().encode()).hexdigest(), 16) % num_buckets
   ```

3. **Time bucket helpers**
   ```python
   def get_week_bucket(dt: datetime) -> str:
       return dt.strftime("%Y-W%W")
   
   def get_day_bucket(dt: datetime) -> str:
       return dt.strftime("%Y-%m-%d")
   ```

## Migration Path

If you're upgrading from the single-keyspace schema:

1. **Deploy new keyspaces** (parallel to old `chain_bd`)
2. **Update backend** to write to both old + new
3. **Backfill historical data** (chain by chain)
4. **Switch reads** to new keyspaces
5. **Drop old keyspace** once verified

## Performance Benchmarks

**Expected query performance at 5T records:**

| Query | Time | Notes |
|-------|------|-------|
| Get wallet by address | <10ms | Single partition read |
| List wallets by type | <50ms | Denormalized table scan |
| Get tx by hash | <10ms | Direct partition lookup |
| Get address txs (last week) | <100ms | Single week partition |
| Get address txs (all time) | N/A | Not supported (use aggregated wallet instead) |
| Token transfers by token (1 day) | <200ms | Bucketed token table |
| Dashboard stats | <20ms | Pre-aggregated daily/hourly stats |

## Monitoring

**Key metrics to watch:**

1. **Partition size** — Should stay <100MB per partition
2. **Read latency p99** — Should stay <50ms
3. **Compaction lag** — Should stay <1 hour
4. **Disk usage** — Monitor per-chain to rebalance nodes
5. **Hot partitions** — Track top 100 addresses by read count

**ScyllaDB Monitoring Stack:**
- Prometheus + Grafana
- ScyllaDB Manager
- Nodetool commands

## Support & Troubleshooting

**Common issues:**

1. **Hot partition detected**
   - Increase bucket count (1000 → 10000)
   - Add address-specific sharding for exchanges

2. **Compaction falling behind**
   - Increase compaction threads
   - Adjust TimeWindowCompactionStrategy window size

3. **Out of disk space**
   - Check TTL is working (`nodetool compactionstats`)
   - Add more nodes to keyspace
   - Decrease TTL for that chain

4. **Cross-chain queries needed**
   - Build application-level aggregation
   - Use separate analytics DB (ClickHouse) fed from ScyllaDB

## Next Steps

1. Update backend to use multi-keyspace routing
2. Deploy to test cluster (3 nodes)
3. Load test with 1B records
4. Tune compaction settings
5. Deploy to production cluster
6. Backfill historical data

---

**Questions? Check:**
- ScyllaDB docs: https://docs.scylladb.com/
- Our Slack: #chain-analytics
- DBA on-call: dba@example.com
