#!/usr/bin/env python3
"""
Train the Wi-Fi failure classifier from data/train.csv (recorded via the dashboard)
and save it to server/model.joblib. Scores it honestly: rows from the same recording
session never appear in both the training and the test split.
"""
import csv
import os
import sys
from collections import Counter

import joblib
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import classification_report, confusion_matrix
from sklearn.model_selection import GroupKFold, StratifiedKFold, cross_val_predict

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, os.path.join(ROOT, "server"))
from brain import FEATURES, MODEL_PATH  # noqa: E402

DATA = os.path.join(ROOT, "data", "train.csv")


def main():
    if not os.path.exists(DATA):
        sys.exit(f"No {DATA}. Record some data from the dashboard first.")
    with open(DATA) as fp:
        rows = list(csv.DictReader(fp))
    X = [[float(r[k]) for k in FEATURES] for r in rows]
    y = [r["label"] for r in rows]
    groups = [r["session"] for r in rows]
    print(f"{len(rows)} rows, {len(set(groups))} sessions:", dict(Counter(y)))

    model = RandomForestClassifier(n_estimators=200, max_depth=8, class_weight="balanced", random_state=0)
    sessions_per_label = {lbl: len({g for g, l in zip(groups, y) if l == lbl}) for lbl in set(y)}
    if min(sessions_per_label.values()) >= 2:
        cv = GroupKFold(n_splits=min(5, len(set(groups))))
        how = "held-out sessions"
        pred = cross_val_predict(model, X, y, cv=cv, groups=groups)
    else:
        print("WARNING: some label has only one session; record each failure twice for an honest score.")
        cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=0)
        how = "random split (optimistic)"
        pred = cross_val_predict(model, X, y, cv=cv)

    labels = sorted(set(y))
    acc = sum(p == t for p, t in zip(pred, y)) / len(y)
    print(f"\nAccuracy on {how}: {acc:.1%}\n")
    print(classification_report(y, pred, labels=labels, zero_division=0))
    print("Confusion matrix (rows = truth, cols = predicted):", labels)
    for lbl, row in zip(labels, confusion_matrix(y, pred, labels=labels)):
        print(f"  {lbl:>11} {row}")

    model.fit(X, y)
    importances = sorted(zip(FEATURES, model.feature_importances_), key=lambda kv: -kv[1])
    print("\nWhat the model looks at most:")
    for k, v in importances[:6]:
        print(f"  {k:>15} {v:.2f}")
    joblib.dump({"model": model, "features": FEATURES, "name": "RandomForest (200 trees)",
                 "accuracy": round(acc, 3), "accuracy_method": how, "samples": len(rows),
                 "importances": [[k, round(float(v), 3)] for k, v in importances]}, MODEL_PATH)
    print(f"\nSaved {MODEL_PATH}. Click 'Reload model' on the dashboard (or restart the server).")


if __name__ == "__main__":
    main()
