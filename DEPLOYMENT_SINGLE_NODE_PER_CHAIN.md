# Single-Node-Per-Chain Deployment — Scale Horizontally as Needed

## Overview

**Start simple:** 1 server per blockchain = 10 servers total  
**Scale later:** When data grows, split each chain across multiple servers

---

## Phase 1: Initial Setup (10 Nodes)

| Chain | Server | Storage | Cost/Month | Notes |
|-------|--------|---------|------------|-------|
| ETH | Node-1 | 10TB | $800 | Highest traffic |
| BNB | Node-2 | 6TB | $600 | Second highest |
| SOL | Node-3 | 4TB | $500 | High throughput |
| ARB | Node-4 | 4TB | $500 | Layer 2 |
| OP | Node-5 | 4TB | $500 | Layer 2 |
| BASE | Node-6 | 4TB | $500 | Layer 2 |
| POLYGON | Node-7 | 4TB | $500 | Side chain |
| AVAX | Node-8 | 4TB | $500 | Alternative L1 |
| XLAYER | Node-9 | 2TB | $400 | Low priority |
| BTC | Node-10 | 4TB | $500 | Archive |

**Total:** 10 servers, ~$5,300/month

### Server Specs (Per Node)

**Small Start (1-100M records per chain):**
- CPU: 8 cores
- RAM: 32GB
- Storage: 2-10TB SSD
- Cost: $400-800/month

**Medium (100M-1B records):**
- CPU: 16 cores
- RAM: 64GB
- Storage: 4-10TB NVMe
- Cost: $600-1,000/month

**Large (1B-10B records):**
- CPU: 32 cores
- RAM: 128GB
- Storage: 10-20TB NVMe
- Cost: $1,200-2,000/month

---

## Phase 2: Scale Out When Needed (60+ Nodes)

When **one chain gets too big**, split it across multiple servers:

### Example: ETH Grows to 500GB → 5TB → 50TB

**At 5TB (still fits on one node):**
- Node-1: All ETH data
- Works fine

**At 50TB (too big for one node):**
Split into **5 shards**:
- Node-1a: ETH addresses A-D (10TB)
- Node-1b: ETH addresses E-H (10TB)
- Node-1c: ETH addresses I-M (10TB)
- Node-1d: ETH addresses N-R (10TB)
- Node-1e: ETH addresses S-Z (10TB)

**How it works:**
- User searches address `0xd8dA...` (starts with "d")
- Backend routes to **Node-1a** automatically
- Still fast, now scales to 50TB+

---

## Horizontal Scaling Strategy

### When to Add More Nodes

| Sign | Action |
|------|--------|
| **Disk >80% full** | Add another node, split data |
| **Queries >200ms** | Add read replicas |
| **Writes slow** | Add more shards |
| **New chain needed** | Just add 1 new node |

### Shard Distribution Logic

**Option 1: By Address Range** (simple)
```
Node-1a: 0x0000... to 0x3fff...
Node-1b: 0x4000... to 0x7fff...
Node-1c: 0x8000... to 0xbfff...
Node-1d: 0xc000... to 0xffff...
```

**Option 2: By Address Bucket** (what we designed)
```
Node-1a: buckets 0-199
Node-1b: buckets 200-399
Node-1c: buckets 400-599
Node-1d: buckets 600-799
Node-1e: buckets 800-999
```

**Backend automatically routes** queries to correct node.

---

## Scaling Path: 10 → 60+ Nodes

### Year 1 (10 nodes)
- 1 node per chain
- Total: ~100M-500M records/chain
- Cost: $5,300/month

### Year 2 (20 nodes)
- ETH splits into 3 nodes (high traffic)
- BNB splits into 2 nodes
- Others still 1 node each
- Total: 15 nodes
- Cost: ~$10,000/month

### Year 3 (40 nodes)
- ETH: 10 nodes
- BNB: 5 nodes
- SOL: 5 nodes
- ARB: 3 nodes
- Others: 2 nodes each
- Total: 35 nodes
- Cost: ~$25,000/month

### Year 5 (60+ nodes)
- ETH: 25 nodes
- BNB: 10 nodes
- SOL: 10 nodes
- Others: 3-5 nodes each
- Total: 60+ nodes
- Cost: ~$40,000/month

---

## Simplified Architecture Diagram

```
┌─────────────────────────────────────────┐
│         Load Balancer / API              │
│       (routes by chain + address)        │
└─────────────────────────────────────────┘
                  │
        ┌─────────┴──────────┬──────────┬─────────┐
        │                    │          │         │
   ┌────▼────┐         ┌────▼────┐  ┌──▼───┐  ┌──▼───┐
   │ Node-1  │         │ Node-2  │  │Node-3│  │Node-4│
   │  (ETH)  │         │  (BNB)  │  │(SOL) │  │(ARB) │
   │  10TB   │         │   6TB   │  │ 4TB  │  │ 4TB  │
   └─────────┘         └─────────┘  └──────┘  └──────┘
        ...              ...
```

### When ETH Outgrows 1 Node:

```
┌─────────────────────────────────────────┐
│      API (smart routing by address)     │
└─────────────────────────────────────────┘
                  │
        ┌─────────┼──────────┬──────────┐
        │         │          │          │
   ┌────▼────┐ ┌─▼─────┐ ┌──▼────┐  ┌──▼────┐
   │Node-1a  │ │Node-1b│ │Node-1c│  │Node-1d│
   │ETH (A-D)│ │ETH(E-H)│ │ETH(I-M)│ │ETH(N-Z)│
   │  10TB   │ │  10TB │ │  10TB │  │  10TB │
   └─────────┘ └───────┘ └───────┘  └───────┘
```

Backend checks first character of address, routes to correct shard.

---

## Cost Comparison

### Our Approach (Start Small, Scale Up)

| Stage | Nodes | Records | Cost/Month |
|-------|-------|---------|------------|
| Start | 10 | 1B | $5,300 |
| Medium | 20 | 10B | $12,000 |
| Large | 40 | 100B | $25,000 |
| Massive | 60+ | 1T+ | $40,000+ |

### Alternative: Buy Big from Start

| Stage | Nodes | Records | Cost/Month |
|-------|-------|---------|------------|
| Start | 80 | 1B | $60,000 |

**Savings:** Start at **$5K instead of $60K**, scale only when needed.

---

## Backend Code: Smart Routing

```python
# app/routing.py
import hashlib

# Node registry: which nodes handle which chain
NODE_REGISTRY = {
    "eth": ["node-1a", "node-1b", "node-1c"],  # ETH split across 3 nodes
    "bnb": ["node-2"],                          # BNB still on 1 node
    "sol": ["node-3"],
    "arb": ["node-4"],
    # ...
}

def get_node_for_address(chain: str, address: str) -> str:
    """Route address to correct node."""
    nodes = NODE_REGISTRY[chain]
    
    if len(nodes) == 1:
        return nodes[0]  # Single node, easy
    
    # Multiple nodes: hash address to pick one
    bucket = int(hashlib.sha256(address.lower().encode()).hexdigest(), 16)
    shard_index = bucket % len(nodes)
    return nodes[shard_index]

# Usage
node = get_node_for_address("eth", "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045")
# Returns: "node-1a" or "node-1b" or "node-1c" (consistent per address)
```

---

## Replication for High Availability

**Option 1: No Replication (Cheap)**
- 1 copy of data
- If node fails, data temporarily unavailable
- Restore from backup (takes time)
- Cost: 1x

**Option 2: Replication Factor 2 (Recommended)**
- 2 copies of data on different servers
- If 1 fails, other keeps working
- Cost: 2x (but safer)

**Option 3: Replication Factor 3 (Enterprise)**
- 3 copies across different datacenters
- Can survive entire datacenter failure
- Cost: 3x

### Cost Impact

| Setup | Nodes (No RF) | Nodes (RF=2) | Nodes (RF=3) | Cost Multiplier |
|-------|---------------|--------------|--------------|-----------------|
| Start (10 chains) | 10 | 20 | 30 | 1x → 2x → 3x |
| Medium (20 shards) | 20 | 40 | 60 | 1x → 2x → 3x |
| Large (40 shards) | 40 | 80 | 120 | 1x → 2x → 3x |

**Recommendation:** Start with **RF=1** (no replication), add **RF=2** when revenue allows.

---

## Deployment: Docker Compose (10 Nodes)

```yaml
version: "3.9"

services:
  # Node 1: Ethereum
  scylla-eth:
    image: scylladb/scylla:5.4
    container_name: chain-node-eth
    ports:
      - "9042:9042"
    volumes:
      - eth_data:/var/lib/scylla
    command: --smp 8 --memory 32G

  # Node 2: BNB
  scylla-bnb:
    image: scylladb/scylla:5.4
    container_name: chain-node-bnb
    ports:
      - "9043:9042"
    volumes:
      - bnb_data:/var/lib/scylla
    command: --smp 8 --memory 32G

  # ... repeat for each chain

  # API (routes to correct node)
  api:
    build: ./backend
    ports:
      - "3001:3001"
    environment:
      - SCYLLA_ETH_HOST=scylla-eth
      - SCYLLA_BNB_HOST=scylla-bnb
      # ...
```

---

## Adding New Chains (Easy)

Want to add **Polygon zkEVM** or **Tron** later?

1. **Add 1 new server** (Node-11)
2. **Deploy schema** for new chain
3. **Update backend** config (add node to registry)
4. **Start indexing** new chain

**No changes to existing chains needed.**

---

## Summary: Your Plan

### Start: 10 Nodes ($5K/month)
- 1 node per chain
- Handles 1B-10B records total
- Simple, easy to manage

### Scale: 20-40 Nodes ($10-25K/month)
- Split busy chains (ETH, BNB) across multiple nodes
- Others stay on 1 node
- Still manageable

### Future: 60+ Nodes ($40K+/month)
- All major chains sharded
- Can handle 1 trillion+ records
- Enterprise-scale

**You grow as your data grows. No waste.**

---

## Questions?

**Q: How do I know when to add more nodes?**  
A: Monitor disk usage and query speed. When >80% full or queries >200ms, time to split.

**Q: Can I start with even fewer nodes?**  
A: Yes! Start with just ETH (1 node) to test, add others later.

**Q: What if I want 100 blockchains eventually?**  
A: Just keep adding 1 node per new chain. Architecture supports it.

**Q: Is this simpler than the 80-node plan?**  
A: Much simpler to start. Same power when you need to scale.

---

**This is the architecture you wanted, bosco. Start small, scale smart.** 🚀
