"""
KINESIS Machine Learning Engine
===============================
Provides supervised learning for CSI gesture classification and continuous
motion estimation.
- Supports scikit-learn (RandomForest, MLP)
- Includes automated calibration / dataset recording
- Provides rule-based Doppler fallback when no model is trained
"""

import os
import time
import pickle
from typing import Dict, List, Tuple, Optional
import numpy as np

try:
    from sklearn.ensemble import RandomForestClassifier
    from sklearn.neural_network import MLPClassifier
    from sklearn.linear_model import Ridge
    SKLEARN_AVAILABLE = True
except ImportError:
    SKLEARN_AVAILABLE = False

from core.dsp import extract_features, StaticClutterFilter, DopplerVelocityEstimator, CSIFrame

GESTURE_CLASSES = ["STILL", "SWIPE_LEFT", "SWIPE_RIGHT", "PUSH", "PULL"]


class KinesisMLEngine:
    def __init__(self, model_path: str = "data/gesture_model.pkl"):
        self.model_path = model_path
        self.classifier = None
        self.is_trained = False
        self.clutter_filter = StaticClutterFilter(alpha=0.03)
        self.doppler = DopplerVelocityEstimator(window_size=32, sampling_rate=100.0)

        # Buffer for training data collection
        self.dataset_X = []
        self.dataset_y = []

        self.load_model()

    def process_frame(self, frame: CSIFrame) -> Dict:
        """
        Processes a single incoming frame and returns predictions.
        """
        dynamic_amp, energy, noise_floor = self.clutter_filter.update(frame)
        velocity, psd = self.doppler.update(frame.complex_csi, motion_energy=energy)
        if energy < 0.08:
            velocity = 0.0
        features = extract_features(dynamic_amp, energy, velocity)

        if self.is_trained and self.classifier is not None:
            pred_idx = self.classifier.predict([features])[0]
            confidence = float(np.max(self.classifier.predict_proba([features])[0]))
            gesture = GESTURE_CLASSES[pred_idx]
        else:
            gesture, confidence = self._rule_based_classify(energy, velocity, features)

        # Estimate instantaneous directional impulse (dx, dy) ONLY for deliberate gestures
        if energy > 0.18 and gesture in ["SWIPE_RIGHT", "SWIPE_LEFT", "PUSH", "PULL"]:
            tilt = float(features[6])
            dx = float(np.clip(tilt * 1.5, -0.9, 0.9))
            dy = float(np.clip(velocity * 1.5, -0.9, 0.9))
        else:
            dx, dy = 0.0, 0.0

        return {
            "seq": frame.seq,
            "energy": float(energy),
            "velocity": float(velocity),
            "noise_floor": float(noise_floor),
            "dx": dx,
            "dy": dy,
            "gesture": gesture,
            "confidence": confidence,
            "features": features.tolist(),
            "psd": psd.tolist(),
            "dynamic_amp": [float(x) for x in dynamic_amp]
        }

    def _rule_based_classify(self, energy: float, velocity: float, features: np.ndarray) -> Tuple[str, float]:
        """Physics-informed Doppler fallback classifier."""
        # Baseline noise floor threshold
        if energy < 0.15:
            return "STILL", 0.98

        tilt = features[6]
        abs_v = abs(velocity)
        abs_t = abs(tilt)

        # Deliberate Push / Pull action (hand moving toward or away from antenna at >0.3 m/s)
        if abs_v > 0.30 and energy > 0.20:
            if velocity > 0:
                return "PUSH", min(0.95, 0.65 + abs_v * 1.0)
            else:
                return "PULL", min(0.95, 0.65 + abs_v * 1.0)

        # Deliberate Swipe Left / Right action (hand traversing link with clear tilt)
        elif abs_t > 0.25 and energy > 0.20:
            if tilt > 0:
                return "SWIPE_RIGHT", min(0.95, 0.65 + abs_t * 1.0)
            else:
                return "SWIPE_LEFT", min(0.95, 0.65 + abs_t * 1.0)

        # Typing on keyboard, breathing, small fidgeting = treat as STILL
        else:
            return "STILL", 0.90

    def add_training_sample(self, features: np.ndarray, label_str: str):
        if label_str in GESTURE_CLASSES:
            idx = GESTURE_CLASSES.index(label_str)
            self.dataset_X.append(features)
            self.dataset_y.append(idx)

    def train_model(self) -> Dict:
        """Trains a classifier on collected samples."""
        if not SKLEARN_AVAILABLE:
            return {"status": "error", "message": "scikit-learn is not available in environment."}

        if len(self.dataset_X) < 50:
            return {"status": "error", "message": f"Insufficient training samples ({len(self.dataset_X)}/50)."}

        X = np.array(self.dataset_X, dtype=np.float32)
        y = np.array(self.dataset_y, dtype=np.int32)

        clf = RandomForestClassifier(n_estimators=50, max_depth=6, random_state=42)
        clf.fit(X, y)
        self.classifier = clf
        self.is_trained = True

        self.save_model()
        return {"status": "success", "samples": len(X), "classes": len(np.unique(y))}

    def save_model(self):
        os.makedirs(os.path.dirname(os.path.abspath(self.model_path)), exist_ok=True)
        with open(self.model_path, "wb") as f:
            pickle.dump({"classifier": self.classifier, "is_trained": self.is_trained}, f)

    def load_model(self):
        if os.path.exists(self.model_path):
            try:
                with open(self.model_path, "rb") as f:
                    data = pickle.load(f)
                    self.classifier = data.get("classifier")
                    self.is_trained = data.get("is_trained", False)
            except Exception:
                self.is_trained = False
