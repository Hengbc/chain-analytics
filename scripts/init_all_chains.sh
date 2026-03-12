#!/bin/bash
# Deploy all chain schemas to ScyllaDB

SCYLLA_HOST=${SCYLLA_HOST:-scylladb}
SCYLLA_PORT=${SCYLLA_PORT:-9042}

CHAINS=(
    "eth"
    "bnb"
    "arb"
    "op"
    "base"
    "polygon"
    "avax"
    "xlayer"
    "solana"
    "btc"
)

echo "=========================================="
echo "Deploying Multi-Keyspace Schema"
echo "Target: $SCYLLA_HOST:$SCYLLA_PORT"
echo "Chains: ${CHAINS[@]}"
echo "=========================================="

for chain in "${CHAINS[@]}"; do
    schema_file="chains/init_chain_bd_${chain}.cql"
    
    if [ ! -f "$schema_file" ]; then
        echo "[SKIP] $schema_file not found"
        continue
    fi
    
    echo ""
    echo "[DEPLOY] chain_bd_$chain"
    echo "  File: $schema_file"
    
    cqlsh $SCYLLA_HOST $SCYLLA_PORT -f "$schema_file"
    
    if [ $? -eq 0 ]; then
        echo "  [OK] chain_bd_$chain deployed"
    else
        echo "  [ERROR] chain_bd_$chain failed"
        exit 1
    fi
done

echo ""
echo "=========================================="
echo "All schemas deployed successfully!"
echo "=========================================="
echo ""
echo "Verify keyspaces:"
echo "  cqlsh $SCYLLA_HOST -e \"DESC KEYSPACES\""
echo ""
echo "Check tables for a chain:"
echo "  cqlsh $SCYLLA_HOST -e \"USE chain_bd_eth; DESC TABLES;\""
