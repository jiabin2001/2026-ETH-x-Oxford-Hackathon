import { Agent } from "./base.js";
import { Signal, RiskMetric, ActionIntent } from "@rpm/shared";
import { nowIso } from "../util/time.js";
import { ObservationFrame } from "../observe/types.js";
import { chatComplete, tryParseJson } from "../llm/llmClient.js";
import { CONFIG } from "../config.js";

/**
 * Credit/Counterparty agent (MVP):
 * - watches issuer/custodian risk flags
 * - replace stubbed inputs with attested metrics / news triggers
 */
export class CreditCounterpartyAgent implements Agent {
  name = "CreditCounterpartyAgent";

  async run(frame: ObservationFrame): Promise<Signal[]> {
    const flag = frame.data.find(d => d.key === "issuer:flag")?.value as any | undefined;
    const creditScore = flag?.creditScore ?? 0.15; // 0=best, 1=worst (demo)

    const metrics: RiskMetric[] = [{
      name: "CreditScore",
      value: creditScore,
      unit: "0..1",
      explanation: "Proxy credit risk score. In production, derive from covenants, downgrades, attested disclosures.",
      inputs: { flag },
    }];

    const recs: ActionIntent[] = [];
    if (creditScore > 0.65) {
      recs.push({
        type: "REDEEM",
        reason: "Issuer/custodian risk elevated; reduce exposure via redemption if allowed.",
        params: { assetClass: "credit", amountPct: 0.1 },
        proposalSource: this.name,
      });
    }

    let summary = `Credit risk proxy score: ${(creditScore * 100).toFixed(0)}%`;
    let reasons = [
      "Issuer/custodian credit proxy derived from flags.",
      creditScore > 0.65 ? "Score exceeds risk threshold." : "Score within acceptable range.",
    ];

    if (CONFIG.llmEnabled) {
      const res = await chatComplete([
        {
          role: "system",
          content:
            "You are a credit risk assistant. Return STRICT JSON with keys: summary (string), reasons (string[]). No extra keys.",
        },
        {
          role: "user",
          content: JSON.stringify({
            creditScore,
            recommendations: recs,
            baseSummary: summary,
            baseReasons: reasons,
          }),
        },
      ]);
      if (res.ok && res.content) {
        const parsed = tryParseJson(res.content) as any;
        if (parsed && typeof parsed.summary === "string" && Array.isArray(parsed.reasons)) {
          const cleaned = parsed.reasons.filter((r: unknown) => typeof r === "string");
          if (cleaned.length) reasons = cleaned;
          summary = parsed.summary || summary;
        }
      }
    }

    return [{
      agent: this.name,
      kind: "RISK",
      severity: creditScore > 0.8 ? "CRITICAL" : creditScore > 0.65 ? "HIGH" : creditScore > 0.4 ? "WARN" : "INFO",
      summary,
      details: { creditScore },
      metrics,
      recommendations: recs,
      confidence: 0.7,
      riskScore: Math.round(creditScore * 100),
      reasons,
      evidence: [{ source: "oracle", ref: "issuer:flag", detail: `score=${creditScore}` }],
      constraintsTouched: [],
      stance: recs.length ? "SUPPORT" : "NEUTRAL",
      createdAt: nowIso(),
    }];
  }
}
