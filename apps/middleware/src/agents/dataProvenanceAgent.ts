import { Agent } from "./base.js";
import { Signal } from "@rpm/shared";
import { nowIso } from "../util/time.js";
import { ObservationFrame } from "../observe/types.js";
import { chatComplete, tryParseJson } from "../llm/llmClient.js";
import { CONFIG } from "../config.js";

export class DataProvenanceAgent implements Agent {
  name = "DataProvenanceAgent";

  async run(frame: ObservationFrame): Promise<Signal[]> {
    const conflicts = frame.data.filter(d => (d.conflictKeys?.length ?? 0) > 0);
    const stale = frame.data.filter(d => {
      const ageMs = Date.now() - Date.parse(d.observedAt);
      return ageMs > 60_000; // 60s stale threshold for demo
    });

    const sev = conflicts.length ? "WARN" : stale.length ? "INFO" : "INFO";
    let summary = conflicts.length
      ? `Detected ${conflicts.length} conflicting datapoints.`
      : stale.length
        ? `Detected ${stale.length} stale datapoints.`
        : "Data sources look consistent.";

    let reasons: string[] = [];
    if (conflicts.length) reasons.push("Conflicting datapoints detected across sources.");
    if (stale.length) reasons.push("Some datapoints are older than the freshness threshold.");
    if (!conflicts.length && !stale.length) reasons.push("No conflicts or staleness detected.");

    const evidence = frame.data.slice(0, 3).map(d => ({
      source: d.source,
      ref: d.key,
      detail: `observedAt=${d.observedAt}`,
    }));

    if (CONFIG.llmEnabled) {
      const res = await chatComplete([
        {
          role: "system",
          content:
            "You are a data provenance assistant. Return STRICT JSON with keys: summary (string), reasons (string[]). No extra keys.",
        },
        {
          role: "user",
          content: JSON.stringify({
            total: frame.data.length,
            conflicts: conflicts.map(c => c.key),
            stale: stale.map(s => s.key),
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

    const sig: Signal = {
      agent: this.name,
      kind: "OBSERVATION",
      severity: sev,
      summary,
      details: {
        total: frame.data.length,
        conflicts: conflicts.map(c => c.key),
        stale: stale.map(s => s.key),
      },
      confidence: conflicts.length ? 0.72 : stale.length ? 0.6 : 0.85,
      reasons,
      evidence,
      constraintsTouched: [],
      stance: "NEUTRAL",
      createdAt: nowIso(),
    };

    return [sig];
  }
}
