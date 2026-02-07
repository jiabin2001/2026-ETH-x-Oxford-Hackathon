# RWA Portfolio Manager

Risk-management middleware and dashboard for tokenized real-world assets (RWAs). The system runs an agent swarm to observe markets, produce signals, aggregate consensus, apply constraints, and queue bounded actions with a full audit trail.

WARNING: MVP demo only. Do not use in production without security, legal/compliance, and smart-contract audits.

## Architecture (end-to-end)
1. **Observation**: The middleware builds an observation frame from on-chain/context data and Web2 attestations (CoinGecko prices + Flare FDC Web2Json).
2. **Agent swarm**: Specialized agents emit signals and action intents (provenance, valuation, liquidity, credit, compliance, strategy, analyst).
3. **Risk & consensus**: A risk sentinel computes portfolio-level metrics; the orchestrator aggregates signals into a consensus decision with weighted approvals and veto logic.
4. **Constraints & execution**: A constraint engine enforces regulatory/risk/execution/operations rules before the execution agent queues on-chain actions.
5. **Audit & API**: All signals/decisions are written to an append-only JSONL audit log and exposed via a minimal API.
6. **Dashboard**: A React dashboard polls the API via an effectful loop and renders risk posture, decisions, signals, and audit context.

## Key components
- **Middleware (TypeScript/Node)**: Tick loop, observation pipeline, agent swarm, consensus engine, constraint checks, execution queueing, audit trail, API server.
- **Dashboard (React/Vite)**: Real-time risk UI with polling runtime, filtering, and drill-down views.
- **Model service (Python/FastAPI)**: Hidden relationship discovery service that suggests hedges via correlation heuristics.
- **Contracts (Solidity/Hardhat)**: Registry, constraint store, transaction queue, execution router, vault, compliance whitelist, and circuit breaker skeletons.

## Feature highlights
- Bounded autonomy: consensus + constraint engine gates execution.
- Verifiable data: Flare FDC Web2Json flow with proof retrieval.
- Risk scoring: concentration + liquidity + credit + drawdown proxies.
- Auditability: append-only JSONL audit log and API tail reader.
- Extensible swarm: plug-in agents with uniform signal/action schema.

## Effectful programming (core paradigm)
Control flow is modeled as explicit effects (see `packages/shared/src/effects.ts`). Both middleware and dashboard run effect programs (tick loop + polling loop) interpreted at runtime boundaries (HTTP, clock, logging, UI sink, file IO), making side effects visible and composable. See `EFFECTS.md` for the full inventory and references.

## Monorepo layout
- `apps/middleware/` - swarm middleware (TypeScript)
- `apps/dashboard/` - risk dashboard (React)
- `apps/model-service/` - relationship discovery service (Python)
- `contracts/` - Solidity contracts + Hardhat config
- `packages/shared/` - shared types/schemas/effects
- `docs/` - architecture notes

## How to run
### 1) Install dependencies
```bash
npm install
```

### 2) Run everything (dashboard + middleware)
```bash
npm run dev:all
```

### Run separately
- Middleware (API) only: `npm run dev`
- Dashboard only: `npm run dev:dashboard`

### Run model service (optional)
```bash
cd apps/model-service
python -m venv .venv
.\.venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8010
```

### Contracts (optional)
```bash
cd contracts
npm install
npx hardhat test
```

## Ports
- Dashboard: `http://localhost:5173`
- API: `http://localhost:3001`

## API endpoints
- Health: `GET http://localhost:3001/api/health`
- State: `GET http://localhost:3001/api/state`
- Audit: `GET http://localhost:3001/api/audit?lines=200`

## Environment
- Copy `apps/middleware/.env.example` -> `apps/middleware/.env`.
- Configure Flare FDC, LLM, CoinGecko, and model-service URLs as needed.

## License
MIT (see `LICENSE`).
