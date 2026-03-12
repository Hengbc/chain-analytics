"""Wallet classification engine — scores and labels wallets."""

import logging
from typing import Dict, List

logger = logging.getLogger(__name__)

# ── Transfer event topic ──
TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef"


def classify_wallet(info: Dict) -> Dict:
    """
    Classify a wallet by type, tier, risk score, and tags.

    Input: address info dict from rpc.get_address_info()
    Output: {wallet_type, wallet_tier, risk_score, confidence, tags}
    """
    if not info:
        return _default()

    tx_count = info.get("tx_count", 0)
    balance = info.get("balance", 0)
    is_contract = info.get("is_contract", False)
    code_size = info.get("code_size", 0)
    tx_in = info.get("tx_in_count", 0)
    tx_out = info.get("tx_out_count", 0)

    wallet_type = "unknown"
    tags: List[str] = []
    risk_score = 0.0
    confidence = 0.3  # base confidence for on-chain-only analysis

    # ── Type classification ──
    if is_contract:
        wallet_type = "contract"
        tags.append("smart-contract")
        confidence = 0.8

        if code_size > 20000:
            tags.append("large-contract")
        if code_size > 5000:
            tags.append("complex-contract")
    else:
        # EOA classification
        if tx_count == 0:
            wallet_type = "unknown"
            tags.append("no-activity")
        elif tx_count > 100000:
            wallet_type = "bot"
            tags.append("high-frequency")
            confidence = 0.7
            risk_score = 0.4
        elif tx_count > 10000:
            wallet_type = "exchange"
            tags.append("high-volume")
            confidence = 0.5
        elif tx_count > 100:
            wallet_type = "user"
            tags.append("active")
            confidence = 0.6
        else:
            wallet_type = "user"
            tags.append("casual")
            confidence = 0.5

        # Check for bot patterns
        if tx_out > 0 and tx_in > 0:
            ratio = tx_out / max(tx_in, 1)
            if ratio > 10:
                tags.append("sender-heavy")
                if wallet_type == "user":
                    wallet_type = "bot"
                    confidence = 0.6
            elif ratio < 0.1:
                tags.append("receiver-heavy")

    # ── Tier classification (by balance in native token) ──
    wallet_tier = _classify_tier(balance, info.get("chain", "eth"))

    # ── Risk scoring ──
    risk_score = _calculate_risk(
        tx_count=tx_count,
        wallet_type=wallet_type,
        is_contract=is_contract,
        balance=balance,
        tags=tags,
    )

    return {
        "wallet_type": wallet_type,
        "wallet_tier": wallet_tier,
        "risk_score": round(risk_score, 3),
        "confidence": round(confidence, 3),
        "tags": tags,
    }


def _classify_tier(balance: int, chain: str) -> str:
    """Classify wallet tier by native balance."""
    # Convert to ETH-equivalent (rough)
    eth_balance = balance / 1e18

    if chain in ("btc",):
        eth_balance = (balance / 1e8) * 15  # rough BTC->ETH

    if chain in ("solana",):
        eth_balance = (balance / 1e9) * 0.05  # rough SOL->ETH

    if eth_balance >= 1000:
        return "whale"
    elif eth_balance >= 100:
        return "shark"
    elif eth_balance >= 10:
        return "dolphin"
    else:
        return "shrimp"


def _calculate_risk(
    tx_count: int,
    wallet_type: str,
    is_contract: bool,
    balance: int,
    tags: List[str],
) -> float:
    """Calculate risk score 0.0 - 1.0."""
    risk = 0.0

    # High frequency = higher risk
    if tx_count > 100000:
        risk += 0.3
    elif tx_count > 10000:
        risk += 0.15
    elif tx_count > 1000:
        risk += 0.05

    # Bot patterns
    if wallet_type == "bot":
        risk += 0.2
    if "sender-heavy" in tags:
        risk += 0.1
    if "high-frequency" in tags:
        risk += 0.1

    # New wallet with high balance
    if tx_count < 5 and balance > 100 * 1e18:
        risk += 0.2
        tags.append("suspicious-funding")

    # Contract risk
    if is_contract:
        risk += 0.05  # contracts are slightly riskier by default

    return min(risk, 1.0)


def _default() -> Dict:
    return {
        "wallet_type": "unknown",
        "wallet_tier": "shrimp",
        "risk_score": 0.0,
        "confidence": 0.0,
        "tags": [],
    }
