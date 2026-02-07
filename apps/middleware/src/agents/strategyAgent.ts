import { Agent } from "./base.js";
import { ActionIntent, Signal } from "@rpm/shared";
import { nowIso } from "../util/time.js";
import { ObservationFrame } from "../observe/types.js";
import { chatComplete, tryParseJson } from "../llm/llmClient.js";
import { CONFIG } from "../config.js";

export class StrategyAgent implements Agent {
  name = "StrategyAgent";

  async run(frame: ObservationFrame): Promise<Signal[]> {
    // Example: simple diversification suggestion
    const totalValue = frame.positions.reduce((a, p) => a + Number(p.value), 0);
    const biggest = [...frame.positions].sort((a, b) => Number(b.value) - Number(a.value))[0];

    const recs: ActionIntent[] = [];
    if (biggest && totalValue && Number(biggest.value) / totalValue > 0.7) {
      recs.push({
        type: "HEDGE",
        reason: "Concentration high; propose a hedge or diversified allocation.",
        params: { against: biggest.symbol, instrument: "perp/option", notionalPct: 0.15, slippageBps: 25, turnover: 0.02 },
        proposalSource: this.name,
      });
    }

    let summary = recs.length ? "Strategy proposes hedge due to concentration." : "No strategy actions proposed.";
    let reasons = recs.length
      ? ["Top position exceeds concentration threshold.", "Hedge proposed to reduce concentration risk."]
      : ["Concentration within acceptable bounds."];

    if (CONFIG.llmEnabled) {
      const res = await chatComplete([
        {
          role: "system",
          content:
            "You are a portfolio strategy assistant. Return STRICT JSON with keys: summary (string), reasons (string[]). No extra keys.",
        },
        {
          role: "user",
          content: JSON.stringify({
            totalValue,
            biggest: biggest?.symbol ?? null,
            concentration: totalValue ? Number(biggest.value) / totalValue : 0,
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
      kind: "STRATEGY",
      severity: recs.length ? "WARN" : "INFO",
      summary,
      details: { totalValue, biggest: biggest?.symbol },
      recommendations: recs,
      confidence: recs.length ? 0.68 : 0.58,
      riskScore: recs.length && totalValue ? Math.round((Number(biggest.value) / totalValue) * 100) : 0,
      reasons,
      evidence: [{ source: "portfolio", ref: "positions", detail: `top=${biggest?.symbol ?? "n/a"}` }],
      constraintsTouched: [],
      stance: recs.length ? "SUPPORT" : "NEUTRAL",
      createdAt: nowIso(),
    }];
  }
}
