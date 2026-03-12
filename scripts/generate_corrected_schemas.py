#!/usr/bin/env python3
"""
Generate blockchain-specific schemas respecting each chain's unique structure.
- EVM chains: Use base template with customization
- Solana: Separate schema (slots, signatures, lamports, SPL)
- Bitcoin: Separate schema (UTXO model, inputs/outputs)
"""

import os
from pathlib import Path

# EVM Chain Configurations
EVM_CHAINS = {
    "eth": {
        "keyspace": "chain_bd_eth",
        "name": "Ethereum",
        "symbol": "ETH",
        "rf": 3,                # Replication factor
        "ttl_days": 90,
        "priority": "CRITICAL",
        "notes": "Largest EVM chain, 60% of data",
    },
    "bnb": {
        "keyspace": "chain_bd_bnb",
        "name": "BNB Chain",
        "symbol": "BNB",
        "rf": 3,
        "ttl_days": 90,
        "priority": "HIGH",
        "notes": "Second largest, 20% of data",
    },
    "arb": {
        "keyspace": "chain_bd_arb",
        "name": "Arbitrum One",
        "symbol": "ETH",
        "rf": 2,
        "ttl_days": 60,
        "priority": "HIGH",
        "notes": "Layer 2, fast blocks (0.25s)",
    },
    "op": {
        "keyspace": "chain_bd_op",
        "name": "Optimism",
        "symbol": "ETH",
        "rf": 2,
        "ttl_days": 60,
        "priority": "MEDIUM",
        "notes": "Layer 2, 2s blocks",
    },
    "base": {
        "keyspace": "chain_bd_base",
        "name": "Base",
        "symbol": "ETH",
        "rf": 2,
        "ttl_days": 60,
        "priority": "MEDIUM",
        "notes": "Coinbase L2, 2s blocks",
    },
    "polygon": {
        "keyspace": "chain_bd_polygon",
        "name": "Polygon PoS",
        "symbol": "MATIC",
        "rf": 2,
        "ttl_days": 60,
        "priority": "MEDIUM",
        "notes": "Sidechain, 2s blocks",
    },
    "avax": {
        "keyspace": "chain_bd_avax",
        "name": "Avalanche C-Chain",
        "symbol": "AVAX",
        "rf": 2,
        "ttl_days": 60,
        "priority": "MEDIUM",
        "notes": "Alternative L1, 2s blocks",
    },
    "xlayer": {
        "keyspace": "chain_bd_xlayer",
        "name": "X Layer",
        "symbol": "OKB",
        "rf": 1,
        "ttl_days": 30,
        "priority": "LOW",
        "notes": "OKX L2, low volume",
    },
}


def generate_evm_chain_schema(chain_id: str, config: dict) -> str:
    """Generate EVM chain schema from base template."""
    # Read base template
    base_path = Path("schemas/evm/base_evm_schema.cql")
    with open(base_path, "r", encoding="utf-8") as f:
        template = f.read()
    
    # Replace variables
    ttl_seconds = config["ttl_days"] * 86400
    
    schema = template.replace("{KEYSPACE}", config["keyspace"])
    schema = schema.replace("{RF}", str(config["rf"]))
    schema = schema.replace("{TTL}", str(ttl_seconds))
    schema = schema.replace("{CHAIN_NAME}", config["name"])
    
    # Add header comment
    header = f"""-- ============================================================
-- {config["name"]} ({config["symbol"]})
-- Keyspace: {config["keyspace"]}
-- Priority: {config["priority"]}
-- Retention: {config["ttl_days"]} days
-- Replication Factor: {config["rf"]}
-- Notes: {config["notes"]}
-- ============================================================

"""
    
    return header + schema


def main():
    """Generate all chain schemas."""
    
    # Create output directory
    output_dir = Path("schemas/generated")
    output_dir.mkdir(parents=True, exist_ok=True)
    
    print("=" * 60)
    print("Generating Blockchain Schemas")
    print("=" * 60)
    
    # Generate EVM chains
    print("\n[EVM CHAINS]")
    for chain_id, config in EVM_CHAINS.items():
        schema = generate_evm_chain_schema(chain_id, config)
        
        output_file = output_dir / f"init_chain_bd_{chain_id}.cql"
        with open(output_file, "w", encoding="utf-8") as f:
            f.write(schema)
        
        print(f"  [OK] {config['name']:20} -> {output_file.name}")
    
    # Copy Solana schema (already correct)
    print("\n[NON-EVM CHAINS]")
    solana_src = Path("schemas/solana/init_chain_bd_solana.cql")
    solana_dst = output_dir / "init_chain_bd_solana.cql"
    
    if solana_src.exists():
        with open(solana_src, "r", encoding="utf-8") as f:
            solana_content = f.read()
        with open(solana_dst, "w", encoding="utf-8") as f:
            f.write(solana_content)
        print(f"  [OK] {'Solana':20} -> {solana_dst.name}")
    else:
        print(f"  [SKIP] Solana schema not found")
    
    # Copy Bitcoin schema (already correct)
    btc_src = Path("schemas/bitcoin/init_chain_bd_btc.cql")
    btc_dst = output_dir / "init_chain_bd_btc.cql"
    
    if btc_src.exists():
        with open(btc_src, "r", encoding="utf-8") as f:
            btc_content = f.read()
        with open(btc_dst, "w", encoding="utf-8") as f:
            f.write(btc_content)
        print(f"  [OK] {'Bitcoin':20} -> {btc_dst.name}")
    else:
        print(f"  [SKIP] Bitcoin schema not found")
    
    print("\n" + "=" * 60)
    print(f"Generated {len(EVM_CHAINS) + 2} blockchain schemas")
    print("=" * 60)
    
    print("\nOutput directory:", output_dir.absolute())
    print("\nNext steps:")
    print("  1. Review generated schemas in:", output_dir)
    print("  2. Deploy to ScyllaDB:")
    print("     - Windows: .\\init_all_corrected_schemas.ps1")
    print("     - Linux:   ./init_all_corrected_schemas.sh")
    print("  3. Update backend to use chain-specific logic")


if __name__ == "__main__":
    main()
