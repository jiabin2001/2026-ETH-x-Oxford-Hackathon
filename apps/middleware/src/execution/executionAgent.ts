import { ActionIntent, Signal } from "@rpm/shared";
import { nowIso } from "../util/time.js";
import { checkAll, ConstraintContext } from "../constraints/constraints.js";
import { OnchainClient } from "./onchainClient.js";
import { ObservationFrame } from "../observe/types.js";

export class ExecutionAgent {
  name = "ExecutionAgent";
  constructor(private onchain: OnchainClient) {}

  async execute(frame: ObservationFrame, riskScore: number, intents: ActionIntent[]): Promise<Signal[]> {
    const dynamic = await this.onchain.getDynamicConstraints();

    const ctx: ConstraintContext = {
      positions: frame.positions,
      riskScore,
      dynamic,
    };

    const signals: Signal[] = [];
    for (const intent of intents) {
      const res = checkAll(intent, ctx);
      if (!res.ok) {
        const touched = res.violations.map(v => `${v.layer}:${v.code}`);
        signals.push({
          agent: this.name,
          kind: "EXECUTION",
          severity: "WARN",
          summary: `Denied ${intent.type} due to constraint violations.`,
          details: { intent, violations: res.violations },
          confidence: 0.9,
          riskScore: riskScore,
          reasons: ["Constraint checks failed; action blocked."],
          evidence: [{ source: "rules", ref: "constraints", detail: touched.join(", ") || "violations" }],
          constraintsTouched: touched,
          stance: "OPPOSE",
          createdAt: nowIso(),
        });
        continue;
      }

      const tx = await this.onchain.submitAction(intent);
      signals.push({
        agent: this.name,
        kind: "EXECUTION",
        severity: "INFO",
        summary: `Queued ${intent.type} for execution.`,
        details: { intent, tx },
        confidence: 0.92,
        riskScore: riskScore,
        reasons: ["Constraint checks passed; action queued."],
        evidence: [{ source: "rules", ref: "constraints", detail: "all checks passed" }],
        constraintsTouched: [],
        stance: "SUPPORT",
        createdAt: nowIso(),
      });
    }
    return signals;
  }
}
