import { Agent } from "./base.js";
import { Signal } from "@rpm/shared";
import { nowIso } from "../util/time.js";
import { ObservationFrame } from "../observe/types.js";
import { chatComplete, tryParseJson } from "../llm/llmClient.js";
import { CONFIG } from "../config.js";

/**
 * Compliance agent (MVP):
 * - produces an audit-friendly explanation
 * - can veto decisions if it detects rule violations
 */
export class ComplianceAgent implements Agent {
  name = "ComplianceAgent";

  async run(frame: ObservationFrame): Promise<Signal[]> {
    // Demo rule: forbid exposure to a banned tag
    const banned = "sanctioned";
    const hits = frame.positions.filter(p => (p.tags ?? []).includes(banned));

    const veto = hits.length > 0;
    const baseSummary = veto
      ? `Compliance breach: holdings tagged '${banned}'.`
      : "Compliance checks passed (MVP).";
    const baseReasons = veto
      ? [
          `Detected holdings tagged '${banned}'.`,
          "Policy prohibits exposure to sanctioned assets.",
        ]
      : ["No banned tags detected in portfolio positions."];

    let summary = baseSummary;
    let reasons = baseReasons;
    if (CONFIG.llmEnabled) {
      const res = await chatComplete([
        {
          role: "system",
          content:
            "You are a compliance assistant. Return STRICT JSON with keys: summary (string), reasons (string[]). Do not add extra keys.",
        },
        {
          role: "user",
          content: JSON.stringify({
            veto,
            bannedTag: banned,
            hits: hits.map(h => h.symbol),
            baseSummary,
            baseReasons,
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
      kind: "COMPLIANCE",
      severity: veto ? "CRITICAL" : "INFO",
      summary,
      details: { bannedTag: banned, hits: hits.map(h => h.symbol) },
      veto,
      confidence: veto ? 0.92 : 0.88,
      reasons,
      evidence: [
        { source: "portfolio", ref: "positions", detail: `hits=${hits.length}` },
        { source: "rules", ref: "COMPLIANCE:BANNED_TAG", detail: `tag=${banned}` },
      ],
      constraintsTouched: ["COMPLIANCE:BANNED_TAG"],
      stance: veto ? "OPPOSE" : "NEUTRAL",
      createdAt: nowIso(),
    }];
  }
}
