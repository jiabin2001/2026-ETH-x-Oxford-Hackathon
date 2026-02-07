import { Agent } from "./base.js";
import { ActionIntent, Signal } from "@rpm/shared";
import { nowIso } from "../util/time.js";
import { ObservationFrame } from "../observe/types.js";
import { CONFIG } from "../config.js";
import { chatComplete, tryParseJson } from "../llm/llmClient.js";

async function fetchJson(url: string, body?: any) {
  const res = await fetch(url, {
    method: body ? "POST" : "GET",
    headers: { "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${await res.text()}`);
  return res.json();
}

export class AnalystAgent implements Agent {
  name = "AnalystAgent";

  private parseLlmActions(payload: unknown): ActionIntent[] {
    if (!payload || typeof payload !== "object") return [];
    const actions = (payload as any).actions;
    if (!Array.isArray(actions)) return [];
    const allowed = new Set(["REBALANCE", "HEDGE", "REDEEM", "PAUSE", "UNPAUSE", "UPDATE_CONSTRAINTS"]);
    const result: ActionIntent[] = [];
    for (const a of actions) {
      if (!a || typeof a !== "object") continue;
      const type = String((a as any).type ?? "");
      if (!allowed.has(type)) continue;
      const reason = typeof (a as any).reason === "string" ? (a as any).reason : "LLM suggestion.";
      const params = typeof (a as any).params === "object" && (a as any).params ? (a as any).params : {};
      result.push({
        type: type as any,
        reason,
        params,
        proposalSource: `${this.name}:LLM`,
      });
      if (result.length >= 2) break;
    }
    return result;
  }

  async run(frame: ObservationFrame): Promise<Signal[]> {
    // In a real build, you'd send time-series history, not just a snapshot.
    // Here, we send current positions and let model-service respond with suggestions.
    let suggestions: any[] = [];
    let llmSuggestions: ActionIntent[] = [];
    let modelError: string | null = null;
    try {
      const out = await fetchJson(`${CONFIG.modelServiceUrl}/suggest-hedges`, { positions: frame.positions });
      suggestions = out.suggestions ?? [];
    } catch (e) {
      modelError = String(e);
    }

    const recs: ActionIntent[] = suggestions.map(s => ({
      type: "HEDGE",
      reason: s.reason ?? "Model suggests hedge based on learned co-movement.",
      params: { against: s.against, instrument: s.instrument ?? "perp/option", notionalPct: s.notionalPct ?? 0.1, slippageBps: 25, turnover: 0.02 },
      proposalSource: this.name,
    }));

    if (CONFIG.llmEnabled) {
      const res = await chatComplete([
        {
          role: "system",
          content:
            "You are a risk analyst. Return STRICT JSON with keys: actions (array, 0-2). Each action: {type, reason, params}. Allowed types: REBALANCE, HEDGE, REDEEM, PAUSE, UNPAUSE, UPDATE_CONSTRAINTS. No extra keys.",
        },
        {
          role: "user",
          content: JSON.stringify({
            portfolio: frame.positions,
            hints: ["Keep suggestions bounded, small size, avoid free-text."],
          }),
        },
      ]);
      if (res.ok && res.content) {
        const parsed = tryParseJson(res.content);
        if (parsed) llmSuggestions = this.parseLlmActions(parsed);
      }
    }

    return [{
      agent: this.name,
      kind: "RISK",
      severity: recs.length || llmSuggestions.length ? "INFO" : "INFO",
      summary: recs.length || llmSuggestions.length
        ? `Model suggested ${recs.length} hedge candidates${llmSuggestions.length ? " + LLM proposals" : ""}.`
        : modelError
          ? (llmSuggestions.length ? "Model-service unavailable; LLM proposals only." : "Model-service unavailable; no LLM proposals.")
          : "No hedge candidates suggested.",
      details: {
        suggestions,
        llmSuggestions: llmSuggestions.map(a => ({ type: a.type, reason: a.reason, params: a.params })),
        modelError,
      },
      recommendations: [...recs, ...llmSuggestions],
      confidence: recs.length || llmSuggestions.length ? 0.63 : 0.52,
      reasons: recs.length || llmSuggestions.length
        ? [
            modelError ? "Model-service unavailable." : "Model-service provided hedge candidates.",
            llmSuggestions.length ? "LLM provided bounded action proposals." : "LLM disabled or no valid output.",
          ]
        : [modelError ? "Model-service unavailable; no hedge candidates." : "No actionable hedge candidates returned."],
      evidence: [
        { source: "model", ref: "model-service", detail: modelError ? "error" : `suggestions=${recs.length}` },
        ...(llmSuggestions.length ? [{ source: "llm", ref: "LLM", detail: `actions=${llmSuggestions.length}` }] : []),
      ],
      constraintsTouched: [],
      stance: "NEUTRAL",
      createdAt: nowIso(),
    }];
  }
}
