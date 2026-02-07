from __future__ import annotations
from dataclasses import dataclass
from typing import List, Dict, Any
import numpy as np

@dataclass
class Suggestion:
    against: str
    instrument: str
    notionalPct: float
    reason: str

def _simulate_returns(positions: List[Dict[str, Any]], n: int = 90) -> np.ndarray:
    """MVP: generate fake daily returns per asset based on tags.
    Replace with real historical price/NAV series.
    """
    rng = np.random.default_rng(42)
    m = len(positions)
    base = rng.normal(0.0002, 0.01, size=(n, m))
    # Add shared factor for 'rwa' tagged assets to emulate co-movement
    tags = [set(p.get("tags") or []) for p in positions]
    factor = rng.normal(0.0, 0.006, size=(n, 1))
    for j, t in enumerate(tags):
        if "rwa" in t:
            base[:, j] += factor[:, 0] * 0.6
        if "real-estate" in t:
            base[:, j] += rng.normal(0.0, 0.004, size=n)  # idiosyncratic
        if "treasury" in t:
            base[:, j] *= 0.7  # dampen volatility
    return base

def suggest_hedges(positions: List[Dict[str, Any]]) -> List[Suggestion]:
    if len(positions) < 2:
        return []

    rets = _simulate_returns(positions)
    corr = np.corrcoef(rets.T)
    # pick the most correlated pair (excluding diagonal)
    np.fill_diagonal(corr, 0.0)
    i, j = np.unravel_index(np.argmax(np.abs(corr)), corr.shape)
    strength = float(corr[i, j])

    a = positions[i]["symbol"]
    b = positions[j]["symbol"]

    # If correlation high, suggest hedging the largest leg
    largest = max(positions, key=lambda p: float(p.get("value") or 0.0))
    against = largest["symbol"]

    reason = f"Detected strong co-movement (corr≈{strength:.2f}) between {a} and {b}. Hedge proposal targets largest exposure {against} to reduce regime risk."

    return [
        Suggestion(
            against=against,
            instrument="perp/option",
            notionalPct=0.12 if abs(strength) > 0.6 else 0.08,
            reason=reason,
        )
    ]
