## Effectful Programming Notes

This system models the primary control flow as explicit effects: the middleware tick loop
and the dashboard polling loop are written as `Effect<Env, A>` programs and interpreted at
runtime boundaries (HTTP, clock, logging, file IO, UI sink). Side effects are explicit,
composable, and cancellable.

### I/O boundary (effect inventory)
- HTTP server (middleware): `/api/health`, `/api/state`, `/api/audit` (`apps/middleware/src/api/server.ts`).
- HTTP client (dashboard -> API): `GET /api/state` (`apps/dashboard/src/App.tsx`).
- HTTP client (middleware -> CoinGecko): price fetch (`apps/middleware/src/observe/onchainObserver.ts`).
- HTTP client (middleware -> Flare FDC): Web2Json + proof retrieval (`apps/middleware/src/fdc/fdcAdapter.ts`).
- HTTP client (middleware -> model service): `/suggest-hedges` (`apps/middleware/src/agents/analystAgent.ts`).
- HTTP client (middleware -> LLM chat, optional): (`apps/middleware/src/llm/llmClient.ts`).
- File I/O (audit log append-only): (`apps/middleware/src/audit/auditLog.ts`).
- File I/O (FDC cache read/write): (`apps/middleware/src/fdc/fdcAdapter.ts`).
- File I/O (audit tail reader for API): (`apps/middleware/src/api/server.ts`).
- Time (tick schedule, latency measurement, timestamps): (`apps/middleware/src/index.ts`, `apps/dashboard/src/App.tsx`).
- Concurrency + cancellation (effect loops canceled with `AbortController`): (`packages/shared/src/effects.ts`).
- Logging: console log/warn/error hooks (`packages/shared/src/effects.ts`, middleware index).
- UI updates: explicit `UiSink` applies state updates (`apps/dashboard/src/App.tsx`).
- Randomness (model service): simulated returns use `numpy.random` (Python) (`apps/model-service/app/hidden_relationship.py`).

### Effect definitions (code references)
- Effect type, combinators, and runtime: `packages/shared/src/effects.ts`.
- Middleware loop + tick pipeline: `apps/middleware/src/index.ts` (`runLoop`, `tickOnce`).
- Dashboard polling + refresh: `apps/dashboard/src/App.tsx` (`poller`, `refreshOnce`).
- UI boundary interpreter: `apps/dashboard/src/App.tsx` (`applyUpdate`).
- HTTP client constructor: `createHttpClient()` in `packages/shared/src/effects.ts`.

### Pure core (business logic)
- Consensus aggregation + veto/threshold logic: `apps/middleware/src/orchestrator/consensus.ts`.
- Risk scoring metrics (concentration, liquidity, credit, drawdown proxies): `apps/middleware/src/risk/riskSentinel.ts`.
- Constraint checks (regulatory/risk/execution/operations): `apps/middleware/src/constraints/constraints.ts`.
- Signal/decision domain model: `packages/shared/src/types.ts`.
- Dashboard deterministic shaping: `updateHistory`, `scoreToSev`, `sevClass`, filters in `apps/dashboard/src/App.tsx`.

### Runtime (what we used)
- Language/runtime: TypeScript + Node.js (middleware), TypeScript + React (dashboard), Python + FastAPI (model service).
- Effect runtime: lightweight `Effect<Env, A>` abstraction in `packages/shared/src/effects.ts`.
- Runtime wiring (middleware): `createRuntime(...)` provides `clock`, `log`, `bus`, `audit`, `agents`, `executor`; `runLoop` starts the API server, executes `tickOnce`, and repeats on a timed schedule. Cancellation is handled via `AbortController` and SIGINT/SIGTERM.
- Runtime wiring (dashboard): `createRuntime(...)` provides `http`, `clock`, `log`, `ui`; the `poller` effect runs on mount and is canceled on unmount.

### Pure core data flow summary
Observation -> agent signals -> risk score + metrics -> consensus decision -> constraint checks -> execution queue -> audit + API -> dashboard rendering.
