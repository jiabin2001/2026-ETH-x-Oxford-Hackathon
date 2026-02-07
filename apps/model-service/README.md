# Model Service (Hidden Relationship Discovery)

MVP FastAPI service that proposes hedge candidates based on detected co-movement.

- For the hackathon, it **simulates** returns and computes correlation.
- Replace `_simulate_returns()` with real price/NAV history (preferably attested via FDC).

Run:
```bash
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8010
```
