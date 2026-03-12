# Deploy all corrected blockchain schemas to ScyllaDB
# Respects chain differences: EVM, Solana, Bitcoin

$SCYLLA_CONTAINER = "chain-analytics-scylla"
$SCHEMA_DIR = "schemas\generated"

$CHAINS = @(
    @{id="eth"; name="Ethereum"; type="EVM"},
    @{id="bnb"; name="BNB Chain"; type="EVM"},
    @{id="arb"; name="Arbitrum"; type="EVM"},
    @{id="op"; name="Optimism"; type="EVM"},
    @{id="base"; name="Base"; type="EVM"},
    @{id="polygon"; name="Polygon"; type="EVM"},
    @{id="avax"; name="Avalanche"; type="EVM"},
    @{id="xlayer"; name="X Layer"; type="EVM"},
    @{id="solana"; name="Solana"; type="NON-EVM (Slots/SPL)"},
    @{id="btc"; name="Bitcoin"; type="NON-EVM (UTXO)"}
)

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "Deploying Corrected Multi-Chain Schemas" -ForegroundColor Cyan
Write-Host "Container: $SCYLLA_CONTAINER" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan

foreach ($chain in $CHAINS) {
    $schemaFile = "$SCHEMA_DIR\init_chain_bd_$($chain.id).cql"
    
    if (-not (Test-Path $schemaFile)) {
        Write-Host "[SKIP] $($chain.name) - schema not found" -ForegroundColor Yellow
        continue
    }
    
    Write-Host ""
    Write-Host "[DEPLOY] $($chain.name)" -ForegroundColor Green
    Write-Host "  Type: $($chain.type)" -ForegroundColor Gray
    Write-Host "  File: $schemaFile" -ForegroundColor Gray
    
    # Copy schema into container and execute
    docker cp $schemaFile "${SCYLLA_CONTAINER}:/tmp/init.cql"
    docker exec $SCYLLA_CONTAINER cqlsh -f /tmp/init.cql
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "  [OK] chain_bd_$($chain.id) deployed" -ForegroundColor Green
    } else {
        Write-Host "  [ERROR] Deployment failed" -ForegroundColor Red
        exit 1
    }
}

Write-Host ""
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "All schemas deployed successfully!" -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Verify keyspaces:" -ForegroundColor Yellow
Write-Host "  docker exec $SCYLLA_CONTAINER cqlsh -e 'DESC KEYSPACES'"
Write-Host ""
Write-Host "Check EVM chain tables (Ethereum example):" -ForegroundColor Yellow
Write-Host "  docker exec $SCYLLA_CONTAINER cqlsh -e 'USE chain_bd_eth; DESC TABLES;'"
Write-Host ""
Write-Host "Check Solana tables (different structure):" -ForegroundColor Yellow
Write-Host "  docker exec $SCYLLA_CONTAINER cqlsh -e 'USE chain_bd_solana; DESC TABLES;'"
Write-Host ""
Write-Host "Check Bitcoin tables (UTXO model):" -ForegroundColor Yellow
Write-Host "  docker exec $SCYLLA_CONTAINER cqlsh -e 'USE chain_bd_btc; DESC TABLES;'"
