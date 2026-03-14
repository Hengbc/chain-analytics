import pytest
from datetime import datetime
from app.services.classifier import classify_wallet, WalletClassifier

def test_classify_exchange_like():
    info = {
        'tx_count': 20000, 'tx_in_count': 10000, 'tx_out_count': 10000,
        'total_value_in': 1000000, 'gas_spent': 50000, 'unique_interactions': 100,
        'first_seen': datetime.now(), 'is_contract': False
    }
    result = classify_wallet(info)
    assert result['wallet_type'] == 'exchange'
    assert result['confidence'] > 0.4
    assert result['risk_score'] < 0.4

def test_classify_contract():
    info = {'tx_count': 1000, 'is_contract': True, 'unique_interactions': 500}
    result = classify_wallet(info)
    assert result['wallet_type'] == 'contract'

def test_train_placeholder():
    clf = WalletClassifier()
    # Tests synthetic data training
    assert clf.train('eth')  # Should succeed with synthetic

# Run with: pytest app/tests/test_classifier.py -v
