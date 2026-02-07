import { Agent } from "./base.js";
import { Signal, RiskMetric, ActionIntent } from "@rpm/shared";
import { nowIso } from "../util/time.js";
import { ObservationFrame } from "../observe/types.js";
import { chatComplete, tryParseJson } from "../llm/llmClient.js";
import { CONFIG } from "../config.js";

/**
 * Liquidity agent (MVP):
 * - estimates slippage/exit capacity using placeholders
 * - in production, connect to DEX quote endpoints + onchain reserves
 */
export class LiquidityAgent implements Agent {
  name = "LiquidityAgent";

  async run(frame: ObservationFrame): Promise<Signal[]> {
    const totalValue = frame.positions.reduce((a, p) => a + Number(p.value), 0);
    const illiquidValue = frame.positions
      .filter(p => p.tags?.includes("real-estate"))
      .reduce((a, p) => a + Number(p.value), 0);

    const illiqShare = totalValue ? illiquidValue / totalValue : 0;
    const stress = Math.min(1, illiqShare * 1.2);

    const metrics: RiskMetric[] = [{
      name: "LiquidityStress",
      value: stress,
      unit: "0..1",
      explanation: "Higher when a larger share sits in slow-to-exit RWAs or gated markets (MVP proxy).",
      inputs: { illiquidValue, totalValue, illiqShare },
    }];

    const recs: ActionIntent[] = [];
    if (stress > 0.6) {
      recs.push({
        type: "REBALANCE",
        reason: "Liquidity stress elevated; increase liquid reserves / reduce illiquid concentration.",
        params: { assetClass: "real-estate", targetDeltaPct: -0.08, turnover: 0.04, slippageBps: 30 },
        proposalSource: this.name,
      });
    }

    let summary = `Liquidity stress proxy: ${(stress * 100).toFixed(0)}%`;
    let reasons = [
      "Estimated illiquid share of portfolio.",
      stress > 0.6 ? "Liquidity stress exceeds warning threshold." : "Liquidity within acceptable bounds.",
    ];

    if (CONFIG.llmEnabled) {
      const res = await chatComplete([
        {
          role: "system",
          content:
            "You are a liquidity risk assistant. Return STRICT JSON with keys: summary (string), reasons (string[]). No extra keys.",
        },
        {
          role: "user",
          content: JSON.stringify({
            illiquidValue,
            totalValue,
            illiqShare,
            stress,
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
      severity: stress > 0.75 ? "HIGH" : stress > 0.6 ? "WARN" : "INFO",
      summary,
      details: { totalValue, illiquidValue, illiqShare, stress },
      metrics,
      recommendations: recs,
      confidence: 0.74,
      riskScore: Math.round(stress * 100),
      reasons,
      evidence: [
        { source: "portfolio", ref: "positions", detail: `illiquidValue=${illiquidValue.toFixed(2)}` },
      ],
      constraintsTouched: [],
      stance: recs.length ? "SUPPORT" : "NEUTRAL",
      createdAt: nowIso(),
    }];
  }
}
