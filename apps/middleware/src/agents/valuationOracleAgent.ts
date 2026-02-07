import { Agent } from "./base.js";
import { ActionIntent, Signal } from "@rpm/shared";
import { nowIso } from "../util/time.js";
import { ObservationFrame } from "../observe/types.js";
import { chatComplete, tryParseJson } from "../llm/llmClient.js";
import { CONFIG } from "../config.js";

export class ValuationOracleAgent implements Agent {
  name = "ValuationOracleAgent";

  async run(frame: ObservationFrame): Promise<Signal[]> {
    // Example: compare onchain price for tBILL against FDC-attested NAV
    const nav = frame.data.find(d => d.key === "fdc:nav:tBILL")?.value as any | undefined;
    const pos = frame.positions.find(p => p.symbol === "tBILL");

    if (!nav || !pos) {
      return [{
        agent: this.name,
        kind: "RISK",
        severity: "INFO",
        summary: "No NAV/position found for valuation check.",
        details: {},
        confidence: 0.55,
        reasons: ["NAV datapoint or matching position missing."],
        evidence: [{ source: "oracle", ref: "fdc:nav:tBILL", detail: "missing" }],
        constraintsTouched: [],
        stance: "NEUTRAL",
        createdAt: nowIso(),
      }];
    }

    const navPx = Number(nav.nav);
    const mktPx = Number(pos.price);
    const diff = (mktPx - navPx) / navPx;

    const severity = Math.abs(diff) > 0.01 ? "WARN" : "INFO";
    const recs: ActionIntent[] = [];

    if (diff > 0.015) {
      recs.push({
        type: "REBALANCE",
        reason: "Market price above NAV; consider trimming exposure.",
        params: { asset: pos.symbol, targetDeltaPct: -0.05, turnover: 0.03, slippageBps: 20 },
        route: { chainId: pos.chainId ?? 0, venue: "DEX" },
        proposalSource: this.name,
      });
    } else if (diff < -0.015) {
      recs.push({
        type: "REBALANCE",
        reason: "Market price below NAV; consider adding exposure.",
        params: { asset: pos.symbol, targetDeltaPct: 0.05, turnover: 0.03, slippageBps: 20 },
        route: { chainId: pos.chainId ?? 0, venue: "DEX" },
        proposalSource: this.name,
      });
    }

    const divergenceBps = Math.round(Math.abs(diff) * 10_000);
    let summary = `NAV divergence for ${pos.symbol}: ${(diff * 100).toFixed(2)}% (mkt=${mktPx}, nav=${navPx})`;
    let reasons = [
      "Compared attested NAV to market price.",
      divergenceBps > 150 ? "Divergence above tolerance threshold." : "Divergence within tolerance.",
    ];

    if (CONFIG.llmEnabled) {
      const res = await chatComplete([
        {
          role: "system",
          content:
            "You are a valuation oracle assistant. Return STRICT JSON with keys: summary (string), reasons (string[]). No extra keys.",
        },
        {
          role: "user",
          content: JSON.stringify({
            asset: pos.symbol,
            navPx,
            mktPx,
            diff,
            divergenceBps,
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
      severity,
      summary,
      details: { asset: pos.symbol, mktPx, navPx, diff },
      recommendations: recs,
      confidence: 0.78,
      riskScore: Math.min(100, divergenceBps / 2),
      reasons,
      evidence: [
        { source: "FDC", ref: "fdc:nav:tBILL", detail: `nav=${navPx}` },
        { source: "market", ref: `price:${pos.symbol}`, detail: `price=${mktPx}` },
      ],
      constraintsTouched: [],
      stance: recs.length ? "SUPPORT" : "NEUTRAL",
      createdAt: nowIso(),
    }];
  }
}
