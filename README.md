# Chain Analytics — Unified Multi-chain Dashboard

**Stack:** Next.js + FastAPI + ScyllaDB + Redis  
**Chains:** ETH, BNB, ARB, OP, BASE, AVAX, X Layer, POLYGON, Solana, BTC

## Quick Start

```bash
cd C:\Users\Administrator\Desktop\chain-analytics

# 1. Configure your RPC endpoints
# Edit backend/.env with your node URLs

# 2. Start everything
docker-compose up -d

# 3. Wait ~60s for ScyllaDB to initialize
docker logs chain-analytics-scylla-init

# 4. Open dashboard
# Frontend: http://localhost:3000
# API: http://localhost:3001/docs
```

## Services

| Service | Port | Description |
|---------|------|-------------|
| Frontend | 3000 | Next.js dashboard |
| API | 3001 | FastAPI backend |
| ScyllaDB | 9042 | Database |
| Redis | 6379 | Cache |
| Indexer | — | Background block indexer |

## Architecture

```
[Your ETH/BNB/ARB... Nodes]
         ↓
    [Indexer] → [ScyllaDB] → [FastAPI] → [Next.js Dashboard]
                     ↕
                 [Redis Cache]
```

## API Endpoints

- `GET /api/wallets` — List wallets with filters
- `GET /api/wallets/:address` — Wallet detail
- `POST /api/wallets/analyze` — Analyze single address
- `POST /api/wallets/bulk-analyze` — Analyze multiple
- `GET /api/stats` — Dashboard stats
- `GET /api/health` — Health check
- `GET /docs` — Swagger UI

## Test

```bash
# Health check
curl http://localhost:3001/api/health | jq

# Analyze address
curl -X POST http://localhost:3001/api/wallets/analyze \
  -H "Content-Type: application/json" \
  -d '{"chain": "eth", "address": "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045"}' | jq
```

## Stop

```bash
docker-compose down
# Keep data:
docker-compose down

# Delete data:
docker-compose down -v
```
