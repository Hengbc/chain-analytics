# Production Scale: 5 Trillion Records

## What Changed for 5T Scale

### 1. **Bucketing Strategy**
- **Address bucketing:** `hash(address) % 1000` = 1000 buckets per chain
- **Token bucketing:** `hash(token) % 100` = 100 buckets per chain
- **Why:** Spreads hot addresses (Binance, Uniswap) across 1000 partitions instead of 1

### 2. **Time-Based Partitioning**
- **Weekly buckets** for transactions: `(chain, address_bucket, address, week)`
- **Daily buckets** for blocks, stats, activity
- **Why:** Old data naturally ages out, queries stay fast

### 3. **NO Secondary Indexes**
- **Removed:** All `CREATE INDEX` statements
- **Replaced with:** Denormalized query tables (`wallets_by_type`, `labels_by_category`)
- **Why:** Secondary indexes scan entire cluster = death at 5T scale

### 4. **TTL (Time To Live)**
- **90 days:** Transactions, blocks, token transfers
- **30 days:** Hourly stats
- **Forever:** Wallet aggregates, labels, metadata
- **Why:** Automatic data cleanup, keeps cluster lean

### 5. **Denormalized Query Tables**
```
wallets_aggregated         → master record
wallets_by_type           → filter by type/tier
wallets_by_activity       → recent activity view
transactions_by_address   → address history
transactions_by_hash      → direct lookup
token_transfers_by_token  → token analytics
```

## Infrastructure Requirements

### Minimum Cluster for 5T Records

| Component | Spec | Count | Total |
|-----------|------|-------|-------|
| **ScyllaDB Node** | 32 vCPU, 128GB RAM, 10TB NVMe | 20 | 200TB raw |
| **Replication Factor** | RF=3 | | 600TB effective |
| **Network** | 10Gbps | | per node |
| **Estimated Cost** | ~$1000/node/month | | ~$20k/month |

### Node Specs
```yaml
Instance: c5.9xlarge (AWS) or equivalent
CPU: 32 cores (hyperthreaded → 64 threads)
RAM: 128 GB
Storage: 2x 5TB NVMe SSD (RAID0)
Network: 10 Gbps
OS: Ubuntu 22.04 LTS
```

### Cluster Topology
```
Datacenter: us-east-1
  Node 1-7:  Rack A
  Node 8-14: Rack B
  Node 15-20: Rack C

Replication: {'class': 'NetworkTopologyStrategy', 'us-east-1': 3}
```

## Write Throughput Capacity

| Metric | Value |
|--------|-------|
| **Writes/sec per node** | ~100K |
| **Cluster total (20 nodes)** | 2M writes/sec |
| **Daily capacity** | 172 billion writes |
| **Yearly capacity** | 63 trillion writes |

**Your 5T records:** Easily handled over 30 days with this cluster.

## Query Performance

| Query Type | Partition Key | Latency (p99) |
|------------|---------------|---------------|
| Get wallet | `(chain, address_bucket, address)` | <5ms |
| Get tx by hash | `(chain, tx_hash)` | <5ms |
| List txs for address | `(chain, address_bucket, address, week)` | <10ms |
| Filter by wallet type | `(chain, wallet_type, tier)` | <20ms |
| Recent activity | `(chain, day)` | <50ms |

## Data Retention Strategy

```python
# Example retention policy
RETENTION = {
    'blocks': 90,              # days
    'transactions': 90,
    'token_transfers': 90,
    'hourly_stats': 30,
    'wallets': None,           # forever
    'labels': None,
    'daily_stats': None,
}
```

## Compaction Strategy

```cql
-- TimeWindowCompactionStrategy
-- Compacts by time windows (1 day or 7 days)
-- Old data never touched again → efficient
-- New data quickly compacted → low read latency

WITH compaction = {
  'class': 'TimeWindowCompactionStrategy',
  'compaction_window_unit': 'DAYS',
  'compaction_window_size': 7
}
```

## Migration from Old Schema

```bash
# 1. Create new keyspace
cqlsh -f scripts/init_scylla_production.cql

# 2. Run migration script (example)
python migrate_to_bucketed_schema.py \
  --source-keyspace chain_bd \
  --target-keyspace chain_bd_prod \
  --buckets 1000 \
  --batch-size 10000

# 3. Switch app to new keyspace
# Update backend/.env:
SCYLLA_KEYSPACE=chain_bd_prod

# 4. Drop old keyspace after validation
# DROP KEYSPACE chain_bd;
```

## Monitoring

### Key Metrics to Watch
```
- Write latency p99 < 5ms
- Read latency p99 < 10ms
- Disk usage per node < 80%
- CPU usage < 70%
- Compaction pending < 50
- Tombstone warnings: 0
```

### Alerting Thresholds
```yaml
critical:
  - write_latency_p99 > 50ms
  - disk_usage > 85%
  - nodes_down > 1

warning:
  - write_latency_p99 > 10ms
  - disk_usage > 75%
  - compaction_pending > 100
```

## Cost Optimization

### 1. Use Reserved Instances
- **AWS RI (3-year):** ~60% discount
- **$20k/month → $8k/month**

### 2. Tiered Storage
- **Hot data (0-30 days):** NVMe SSD
- **Warm data (30-90 days):** SSD
- **Cold data (>90 days):** Archive to S3

### 3. Adaptive Replication
```
Hot partitions (exchanges): RF=3
Normal partitions: RF=2
Reduce total storage by 33%
```

## Next Steps

1. **Start with 5-node cluster** for testing
2. **Benchmark with your workload**
3. **Scale horizontally** (add nodes as needed)
4. **ScyllaDB auto-rebalances** when you add nodes
5. **Monitor and tune** compaction, caching

## Questions?

- **Can I start smaller?** Yes, 3-5 nodes for testing, scale up
- **What if I exceed 5T?** Add more nodes (ScyllaDB scales to 1000+ nodes)
- **Backup strategy?** Daily snapshots to S3, incremental backups
- **Disaster recovery?** Multi-datacenter replication (RF=3 per DC)

---

**tl;dr:** 20-node cluster, bucketed partitions, time-based TTL, denormalized queries, 2M writes/sec sustained.
