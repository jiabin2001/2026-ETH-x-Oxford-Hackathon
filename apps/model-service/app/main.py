from __future__ import annotations
from typing import Any, Dict, List
from fastapi import FastAPI
from pydantic import BaseModel
from .hidden_relationship import suggest_hedges

app = FastAPI(title="RWA Hidden Relationship Discovery Service", version="0.1.0")

class Position(BaseModel):
    assetId: str
    symbol: str
    quantity: str
    price: str
    value: str
    tags: List[str] | None = None

class SuggestRequest(BaseModel):
    positions: List[Position]

@app.get("/health")
def health() -> Dict[str, Any]:
    return {"ok": True}

@app.post("/suggest-hedges")
def suggest(req: SuggestRequest) -> Dict[str, Any]:
    suggestions = suggest_hedges([p.model_dump() for p in req.positions])
    return {"suggestions": [s.__dict__ for s in suggestions]}
