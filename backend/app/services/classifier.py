import logging
from typing import Dict, List, Optional
from datetime import datetime
import joblib
import os
import pandas as pd
from xgboost import XGBClassifier
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score, classification_report
from sklearn.preprocessing import LabelEncoder
import numpy as np

from app.database import execute_query
from app.schemas.wallet import WalletType

logger = logging.getLogger(__name__)
MODEL_PATH = "/app/models/wallet_classifier.pkl"
os.makedirs(os.path.dirname(MODEL_PATH), exist_ok=True)

class WalletClassifier:
    def __init__(self):
        self.model = XGBClassifier(
            n_estimators=100, max_depth=6, learning_rate=0.1, random_state=42,
            eval_metric='mlogloss', scale_pos_weight=3, early_stopping_rounds=10, verbosity=0
        )
        self.label_encoder = LabelEncoder()
        self.is_trained = False
        self.load_model()

    def load_model(self):
        if os.path.exists(MODEL_PATH):
            try:
                self.model = joblib.load(MODEL_PATH)
                self.is_trained = True
                logger.info("Loaded XGBoost wallet classifier")
            except Exception as e:
                logger.warning(f"Failed to load model: {e}")

    def save_model(self):
        joblib.dump(self.model, MODEL_PATH)
        logger.info("Saved XGBoost model")

    def _extract_features(self, wallet_info: Dict) -> Dict:
        features = {
            'tx_count': wallet_info.get('tx_count', 0),
            'tx_ratio': wallet_info.get('tx_in_count', 0) / (wallet_info.get('tx_out_count', 1) + 1),
            'value_efficiency': wallet_info.get('total_value_in', 0) / (wallet_info.get('gas_spent', 1) + 1),
            'interaction_diversity': wallet_info.get('unique_interactions', 0) / (wallet_info.get('tx_count', 1) + 1),
            'activity_age_days': (datetime.now() - wallet_info.get('first_seen', datetime.now())).days if wallet_info.get('first_seen') else 0,
            'is_contract': 1 if wallet_info.get('is_contract', False) else 0
        }
        return features

    def _get_labeled_data(self, chain: str = 'eth') -> pd.DataFrame:
        keyspace = f"chain_bd_{chain}" if '_' not in chain else chain
        query = f"""
        SELECT tx_count, tx_in_count, tx_out_count, total_value_in, gas_spent, unique_interactions, 
               first_seen, is_contract, wallet_type FROM {keyspace}.wallets 
        WHERE reviewed = true ALLOW FILTERING LIMIT 10000
        """
        rows = execute_query(query)
        if not rows:
            return pd.DataFrame()
        df = pd.DataFrame(rows)
        labeled = df[df['wallet_type'] != 'unknown'].copy()
        if len(labeled) < 100:
            synthetic = self._generate_synthetic(500 - len(labeled))
            labeled = pd.concat([labeled, synthetic], ignore_index=True)
        labeled['label'] = self.label_encoder.fit_transform(labeled['wallet_type'])
        features_df = labeled.apply(self._extract_features, axis=1)
        return pd.concat([features_df, labeled[['label']]], axis=1)

    def _generate_synthetic(self, n: int) -> pd.DataFrame:
        types = ['user', 'exchange', 'script', 'malicious', 'bridge', 'contract', 'bot']
        data = []
        for _ in range(n):
            typ = np.random.choice(types, p=[0.4, 0.15, 0.15, 0.05, 0.1, 0.1, 0.05])
            if typ == 'user':
                tx_count = np.random.randint(10, 1000)
                row = {'tx_count': tx_count, 'tx_in_count': tx_count//2, 'tx_out_count': tx_count//2, 'total_value_in': np.random.randint(1000, 50000), 'gas_spent': tx_count*50, 'unique_interactions': tx_count*0.5, 'first_seen': datetime.now(), 'is_contract': False, 'wallet_type': typ}
            elif typ == 'exchange':
                row = {'tx_count': np.random.randint(10000, 50000), 'tx_in_count': 20000, 'tx_out_count': 20000, 'total_value_in': 1000000, 'gas_spent': 50000, 'unique_interactions': 100, 'first_seen': datetime.now() - pd.Timedelta(days=365), 'is_contract': False, 'wallet_type': typ}
            # Add similar for other types (script: high tx low unique, malicious: high value variance, etc.)
            elif typ == 'script':
                row = {'tx_count': np.random.randint(5000, 20000), 'tx_in_count': 100, 'tx_out_count': 10000, 'total_value_in': 10000, 'gas_spent': 100000, 'unique_interactions': 20, 'first_seen': datetime.now(), 'is_contract': False, 'wallet_type': typ}
            elif typ == 'malicious':
                row = {'tx_count': np.random.randint(100, 1000), 'tx_in_count': 500, 'tx_out_count': 500, 'total_value_in': 10000000, 'gas_spent': 1000, 'unique_interactions': 5, 'first_seen': datetime.now(), 'is_contract': False, 'wallet_type': typ}
            elif typ == 'bridge':
                row = {'tx_count': np.random.randint(1000, 5000), 'tx_in_count': 2500, 'tx_out_count': 2500, 'total_value_in': 500000, 'gas_spent': 25000, 'unique_interactions': 50, 'first_seen': datetime.now() - pd.Timedelta(days=180), 'is_contract': False, 'wallet_type': typ}
            elif typ == 'contract':
                row = {'tx_count': np.random.randint(100, 5000), 'tx_in_count': 0, 'tx_out_count': 0, 'total_value_in': 0, 'gas_spent': 0, 'unique_interactions': 1000, 'first_seen': datetime.now(), 'is_contract': True, 'wallet_type': typ}
            else:  # bot
                row = {'tx_count': np.random.randint(10000, 30000), 'tx_in_count': 5000, 'tx_out_count': 5000, 'total_value_in': 50000, 'gas_spent': 100000, 'unique_interactions': 30, 'first_seen': datetime.now(), 'is_contract': False, 'wallet_type': typ}
            data.append(self._extract_features(row))
        return pd.DataFrame(data)

    def train(self, chain: str = 'eth'):
        df = self._get_labeled_data(chain)
        if df.empty or 'label' not in df:
            logger.warning("No data for training")
            return False
        X = df.drop('label', axis=1)
        y = df['label']
        X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)
        self.model.fit(X_train, y_train, eval_set=[(X_test, y_test)], verbose=False)
        preds = self.model.predict(X_test)
        acc = accuracy_score(y_test, preds)
        logger.info(f"XGBoost trained: Acc {acc:.2f}")
        self.is_trained = True
        self.save_model()
        return True

    def predict(self, wallet_info: Dict) -> Dict:
        if not self.is_trained:
            return self._rule_based_classify(wallet_info)
        features = self._extract_features(wallet_info)
        feat_df = pd.DataFrame([features])
        pred_idx = self.model.predict(feat_df)[0]
        proba = self.model.predict_proba(feat_df)[0]
        confidence = np.max(proba)
        pred_type = self.label_encoder.inverse_transform([pred_idx])[0]
        risk_map = {'malicious': 0.9, 'bot': 0.6, 'script': 0.5, 'exchange': 0.3, 'bridge': 0.2, 'contract': 0.4, 'user': 0.1}
        risk_score = risk_map.get(pred_type, 0.2) * confidence
        return {
            'wallet_type': pred_type,
            'wallet_tier': self._tier_from_type(pred_type, wallet_info.get('tx_count', 0)),
            'risk_score': risk_score,
            'confidence': confidence,
            'tags': self._suggest_tags(pred_type)
        }

    def _rule_based_classify(self, info: Dict) -> Dict:
        tx_count = info.get('tx_count', 0)
        unique = info.get('unique_interactions', 0)
        value = info.get('total_value_in', 0)
        is_cont = info.get('is_contract', False)
        tags = info.get('tags', [])
        if is_cont:
            typ = 'contract'
        elif tx_count > 10000 and unique < 50:
            typ = 'exchange' if value > 1000000 else 'script'
        elif 'bridge' in [t.lower() for t in tags]:
            typ = 'bridge'
        elif tx_count > 500 and unique / max(tx_count, 1) < 0.1:
            typ = 'bot'
        elif value > 0 and tx_count > 100 and unique < 10:
            typ = 'malicious'
        else:
            typ = 'user'
        return {
            'wallet_type': typ,
            'wallet_tier': self._tier_from_type(typ, tx_count),
            'risk_score': 0.5,
            'confidence': 0.5,
            'tags': tags
        }

    def _tier_from_type(self, typ: str, tx_count: int) -> str:
        if typ in ['exchange', 'contract']:
            return 'whale' if tx_count > 10000 else 'shark'
        return 'dolphin' if tx_count > 100 else 'shrimp'

    def _suggest_tags(self, typ: str) -> List[str]:
        if typ == 'bot': return ['automated']
        if typ == 'malicious': return ['risky']
        return []

classifier = WalletClassifier()

def classify_wallet(wallet_info: Dict) -> Dict:
    return classifier.predict(wallet_info)
