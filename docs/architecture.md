# Architecture (MVP)

## Workflow
**Data → Verification → Risk Score → Policy Decision → Constrained Execution**

1. **Observe**
   - On-chain: positions, prices (DEX/oracles), portfolio NAV
   - Off-chain: issuer reports, KYC status, credit events, benchmarks
   - FDC: attest Web2/Web3 facts (NAV snapshots, index levels, event proofs)

2. **Verify**
   - Data provenance agent tracks source, timestamp, confidence, conflicts
   - FDC proofs verified on-chain using Merkle root / proofs

3. **Score risk + explain drivers**
   - Risk sentinels compute VaR, drawdown, liquidity stress, credit flags
   - Each specialist agent produces a `Signal` + explanation

4. **Policy decision**
   - Orchestrator aggregates signals → `Decision`
   - Conflict resolution: prioritize hard constraints and compliance veto
   - Produces recommended actions + optionally parameter updates (soft/dynamic)

5. **Constrained execution**
   - Execution agent validates intents against constraint engine
   - Pushes intents into on-chain `TransactionQueue` with approvals
   - Router executes only pre-approved action types + bounded parameters
   - Circuit breaker requires human multisig / owner

## Rule layers
- Regulatory layer: investor eligibility, jurisdiction rules, disclosures
- Risk layer: position limits, concentration, liquidity reserve, drawdown
- Execution layer: slippage bounds, venue allow-list, gas ceilings
- Operations layer: authority hierarchy, escalation, fail-safe conditions

## Hidden relationship discovery
Model service learns **co-movements** (rolling correlation / regimes) and proposes
hedges or diversification candidates. Middleware treats these as suggestions,
not direct execution.

---

## Architecture updates (Confidence, LLM, Consensus, Reputation, UI)

### 1) Richer agent reports
- Each `Signal` now includes **confidence**, **riskScore**, **reasons**, **evidence**, and **constraintsTouched**.
- This makes decisions auditable: “why” (reasons), “how sure” (confidence), and “receipts” (evidence).

### 2) LLM middleware (optional)
- A local OpenAI-compatible endpoint can be enabled via `.env`:
  - `LLM_ENABLED`, `LLM_CHAT_URL`, `LLM_MODEL`.
- **Compliance** uses the LLM only to rephrase explanations (veto logic remains deterministic).
- **Analyst** can ask the LLM for 0–2 action proposals in **strict JSON**; invalid output is rejected.
- If the LLM is down or disabled, the system falls back to the existing rule/model logic.

### 3) Output validation (“semantic understanding”)
- The LLM is treated as a **suggestion generator** only.
- Outputs must match a rigid JSON schema and a closed action vocabulary.
- Anything malformed/out-of-vocabulary is dropped; valid items still face constraints and consensus.

### 4) Weighted consensus + swarm coordination
- Orchestrator aggregates signals with **weights** (adjusted by reputation).
- Actions are **APPROVED / DENIED / ESCALATED** based on support vs oppose weight thresholds.
- Escalation becomes a first-class outcome when consensus is insufficient.

### 5) Risk sentinel: multi-metric scoring
- Risk score now includes multiple metrics (concentration, liquidity, credit, VaR proxies, drawdown).
- These metrics are attached to the `Decision` for UI display and auditability.

### 6) Reputation calibration
- A reputation store updates agent weights based on consensus outcomes.
- Over time, more reliable agents gain influence; noisy ones lose influence.

### 7) Execution gating remains separate
- Approved actions still go through the constraint engine.
- Escalation blocks execution until human approval.

### 8) Dashboard upgrades
- UI now shows **risk drivers**, escalation reasons, consensus counts, and richer signal details
  (confidence/reasons/evidence/constraints).
