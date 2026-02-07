import { ConsensusRule, Decision, Signal, ActionIntent, ActionConsensus, ConsensusSummary } from "@rpm/shared";
import { v4 as uuidv4 } from "uuid";

export type OrchestratorConfig = {
  // agent weights (0..1), should sum <= 1.0
  weights: Record<string, number>;
  rule: ConsensusRule;
};

function stableStringify(obj: unknown): string {
  if (obj == null || typeof obj !== "object") return JSON.stringify(obj);
  if (Array.isArray(obj)) return `[${obj.map(stableStringify).join(",")}]`;
  const entries = Object.entries(obj as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
  return `{${entries.map(([k, v]) => `"${k}":${stableStringify(v)}`).join(",")}}`;
}

function actionKey(intent: ActionIntent): string {
  return `${intent.type}|${stableStringify(intent.params)}|${stableStringify(intent.route ?? {})}`;
}

export function aggregateSignals(signals: Signal[], rule?: ConsensusRule): { vetoed: boolean; actions: ActionIntent[]; rationale: string } {
  const veto = signals.some(s => s.veto === true && (!rule?.vetoAgents || rule.vetoAgents.includes(s.agent)));
  const actions = signals.flatMap(s => s.recommendations ?? []);
  const rationale = signals.map(s => `- [${s.agent}] ${s.summary}`).join("\n");
  return { vetoed: veto, actions, rationale };
}

export function decide(
  cfg: OrchestratorConfig,
  signals: Signal[],
  riskScore: number,
  effectiveWeights?: Record<string, number>
): Decision {
  const { vetoed, rationale } = aggregateSignals(signals, cfg.rule);
  const weights = effectiveWeights ?? cfg.weights;
  const totalWeight = Object.values(weights).reduce((a, b) => a + b, 0);
  const vetoAgents = signals
    .filter(s => s.veto && (!cfg.rule.vetoAgents || cfg.rule.vetoAgents.includes(s.agent)))
    .map(s => s.agent);
  const opposeAgents = signals.filter(s => s.stance === "OPPOSE").map(s => s.agent);

  const byKey = new Map<string, ActionConsensus>();
  const vetoWeight = vetoAgents.reduce((acc, agent) => acc + (weights[agent] ?? 0), 0);
  const opposeWeight = opposeAgents.reduce((acc, agent) => acc + (weights[agent] ?? 0), 0);
  for (const s of signals) {
    const agentWeight = weights[s.agent] ?? 0;
    const confidence = Number.isFinite(s.confidence) ? s.confidence : 0.5;
    const influence = agentWeight * confidence;
    for (const intent of s.recommendations ?? []) {
      const key = actionKey(intent);
      const existing = byKey.get(key);
      if (!existing) {
        byKey.set(key, {
          intent,
          supportWeight: influence,
          opposeWeight: 0,
          supportAgents: [s.agent],
          opposeAgents: [],
          status: "ESCALATE",
          reasons: s.reasons ?? [],
        });
      } else {
        existing.supportWeight += influence;
        if (!existing.supportAgents.includes(s.agent)) existing.supportAgents.push(s.agent);
        if (s.reasons?.length) existing.reasons.push(...s.reasons);
      }
    }
  }

  const approved: ActionIntent[] = [];
  const denied: { intent: ActionIntent; reason: string }[] = [];
  const approvedConsensus: ActionConsensus[] = [];
  const deniedConsensus: ActionConsensus[] = [];
  const escalatedConsensus: ActionConsensus[] = [];

  for (const entry of byKey.values()) {
    if (opposeWeight > 0) {
      entry.opposeWeight += opposeWeight;
      entry.opposeAgents.push(...opposeAgents.filter(a => !entry.opposeAgents.includes(a)));
    }
    if (vetoed && entry.intent.type !== "PAUSE") {
      entry.opposeWeight += vetoWeight;
      entry.opposeAgents.push(...vetoAgents.filter(a => !entry.opposeAgents.includes(a)));
      entry.status = "DENIED";
      entry.reasons.push("Compliance veto active.");
      denied.push({ intent: entry.intent, reason: "Compliance veto active." });
      deniedConsensus.push(entry);
      continue;
    }
    if (entry.supportWeight >= cfg.rule.thresholdWeight) {
      entry.status = "APPROVED";
      approved.push(entry.intent);
      approvedConsensus.push(entry);
    } else if (entry.opposeWeight >= cfg.rule.thresholdWeight) {
      entry.status = "DENIED";
      denied.push({ intent: entry.intent, reason: "Consensus oppose threshold exceeded." });
      deniedConsensus.push(entry);
    } else {
      entry.status = "ESCALATE";
      escalatedConsensus.push(entry);
    }
  }

  const escalationReasons: string[] = [];
  if (vetoed) escalationReasons.push("Compliance veto raised.");
  if (riskScore >= 90) escalationReasons.push("Risk score exceeds critical threshold.");
  if (escalatedConsensus.length) escalationReasons.push("Insufficient consensus; human oversight required.");

  return {
    decisionId: uuidv4(),
    createdAt: new Date().toISOString(),
    riskScore,
    rationale,
    signals,
    approvedActions: approved,
    deniedActions: denied,
    escalationRequired: vetoed || riskScore >= 90 || escalatedConsensus.length > 0,
    escalationReasons,
    consensus: {
      thresholdWeight: cfg.rule.thresholdWeight,
      totalWeight,
      approved: approvedConsensus,
      denied: deniedConsensus,
      escalated: escalatedConsensus,
    },
    agentWeights: weights,
  };
}
