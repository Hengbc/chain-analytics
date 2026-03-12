# Deploy all chain schemas to ScyllaDB (PowerShell)

$SCYLLA_HOST = if ($env:SCYLLA_HOST) { $env:SCYLLA_HOST } else { "scylladb" }
$SCYLLA_PORT = if ($env:SCYLLA_PORT) { $env:SCYLLA_PORT } else { "9042" }

$CHAINS = @("eth", "bnb", "arb", "op", "base", "polygon", "avax", "xlayer", "solana", "btc")

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "Deploying Multi-Keyspace Schema" -ForegroundColor Cyan
Write-Host "Target: $SCYLLA_HOST:$SCYLLA_PORT" -ForegroundColor Cyan
Write-Host "Chains: $($CHAINS -join ', ')" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan

foreach ($chain in $CHAINS) {
    $schemaFile = "chains\init_chain_bd_$chain.cql"
    
    if (-not (Test-Path $schemaFile)) {
        Write-Host "[SKIP] $schemaFile not found" -ForegroundColor Yellow
        continue
    }
    
    Write-Host ""
    Write-Host "[DEPLOY] chain_bd_$chain" -ForegroundColor Green
    Write-Host "  File: $schemaFile" -ForegroundColor Gray
    
    docker exec chain-analytics-scylla cqlsh -f "/scripts/$schemaFile"
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "  [OK] chain_bd_$chain deployed" -ForegroundColor Green
    } else {
        Write-Host "  [ERROR] chain_bd_$chain failed" -ForegroundColor Red
        exit 1
    }
}

Write-Host ""
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "All schemas deployed successfully!" -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Verify keyspaces:" -ForegroundColor Yellow
Write-Host "  docker exec chain-analytics-scylla cqlsh -e 'DESC KEYSPACES'"
Write-Host ""
Write-Host "Check tables for a chain:" -ForegroundColor Yellow
Write-Host "  docker exec chain-analytics-scylla cqlsh -e 'USE chain_bd_eth; DESC TABLES;'"
