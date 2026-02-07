import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RiskGauge } from "./components/RiskGauge";
import { Sparkline } from "./components/Sparkline";
import {
  Effect,
  createClock,
  createHttpClient,
  createLogger,
  createRuntime,
  type Clock,
  type Effect as EffectType,
  type HttpClient,
  type Logger,
  type UiSink
} from "../../../packages/shared/src/effects";

type ApiState = {
  ok: boolean;
  serverTime: string;
  lastObservedAt?: string;
  lastTickAt?: string;
  lastRiskScore?: number;
  lastDecision?: any;
  lastSignals?: any[];
  lastFrame?: any;
};

type UiUpdate = {
  state: ApiState | null;
  error: string;
  history: number[];
  lastRefreshedAt: string;
  latencyMs: number | null;
};

type DashboardEnv = {
  http: HttpClient;
  clock: Clock;
  log: Logger;
  ui: UiSink<UiUpdate>;
};

function fmtTime(iso?: string) {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleString();
  } catch {
    return iso;
  }
}

function fmtTimeShort(iso?: string) {
  if (!iso || iso === "—") return "—";
  try {
    return new Date(iso).toLocaleTimeString();
  } catch {
    return iso;
  }
}

function fmtConfidence(conf?: number) {
  if (!Number.isFinite(conf)) return "—";
  return `${Math.round((conf ?? 0) * 100)}%`;
}

function actionKey(a: any) {
  return `${a?.type ?? ""}|${JSON.stringify(a?.params ?? {})}|${JSON.stringify(a?.route ?? {})}`;
}

function timeSort(a: any, b: any) {
  const ta = Date.parse(a?.createdAt ?? "") || 0;
  const tb = Date.parse(b?.createdAt ?? "") || 0;
  return ta - tb;
}

function sevClass(sev: string) {
  switch (sev) {
    case "CRITICAL": return "crit";
    case "HIGH": return "high";
    case "WARN": return "warn";
    case "INFO":
    default: return "info";
  }
}

function scoreToSev(score?: number) {
  const s = score ?? 0;
  if (s >= 90) return "CRITICAL";
  if (s >= 75) return "HIGH";
  if (s >= 60) return "WARN";
  return "INFO";
}

function severityRank(sev?: string) {
  switch (sev) {
    case "CRITICAL": return 4;
    case "HIGH": return 3;
    case "WARN": return 2;
    case "INFO":
    default: return 1;
  }
}

function escalationLabel(score?: number, escalationRequired?: boolean) {
  if (escalationRequired) return "Escalate";
  const sev = scoreToSev(score);
  if (sev === "CRITICAL") return "Escalate";
  if (sev === "HIGH") return "High";
  if (sev === "WARN") return "Watch";
  return "Normal";
}

function trendDelta(values: number[]) {
  if (values.length < 2) return 0;
  return values[values.length - 1] - values[values.length - 2];
}

function safeStr(x: any) {
  if (x == null) return "—";
  if (typeof x === "string") return x;
  return JSON.stringify(x);
}

function normalizeError(err: unknown) {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  return JSON.stringify(err);
}

function updateHistory(prev: number[], nextScore?: number) {
  if (!Number.isFinite(nextScore)) return prev;
  return [...prev, Number(nextScore)].slice(-60);
}

function signalKey(s: any) {
  return `${s?.agent ?? ""}|${s?.kind ?? ""}|${s?.createdAt ?? ""}`;
}

function isSameTick(createdAt?: string, tickAt?: string) {
  if (!createdAt || !tickAt) return false;
  return createdAt.slice(0, 19) === tickAt.slice(0, 19);
}

export function App() {
  const [state, setState] = useState<ApiState | null>(null);
  const [error, setError] = useState<string>("");
  const [query, setQuery] = useState<string>("");
  const [sevFilter, setSevFilter] = useState<string>("ALL");
  const [riskOnly, setRiskOnly] = useState(false);
  const [tickOnly, setTickOnly] = useState(false);
  const [selected, setSelected] = useState<any | null>(null);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<string>("—");
  const [latencyMs, setLatencyMs] = useState<number | null>(null);

  const historyRef = useRef<number[]>([]);
  const [history, setHistory] = useState<number[]>([]);
  const stateRef = useRef<ApiState | null>(null);

  const applyUpdate = useCallback((update: UiUpdate) => {
    stateRef.current = update.state;
    historyRef.current = update.history;
    setState(update.state);
    setHistory(update.history);
    setError(update.error);
    setLastRefreshedAt(update.lastRefreshedAt);
    setLatencyMs(update.latencyMs);
  }, []);

  const runtime = useMemo(() => {
    return createRuntime<DashboardEnv>({
      http: createHttpClient(),
      clock: createClock(),
      log: createLogger(),
      ui: { apply: applyUpdate }
    });
  }, [applyUpdate]);

  const fetchStateEffect = useCallback<EffectType<DashboardEnv, { next: ApiState; latencyMs: number; fetchedAt: string }>>(
    async (env, signal) => {
      const startedAt = env.clock.nowMs();
      const next = await env.http.getJson<ApiState>("/api/state", { signal });
      const latency = Math.max(0, Math.round(env.clock.nowMs() - startedAt));
      return {
        next,
        latencyMs: latency,
        fetchedAt: env.clock.nowIso()
      };
    },
    []
  );

  const refreshOnce = useCallback<EffectType<DashboardEnv, void>>(async (env, signal) => {
    try {
      const { next, latencyMs: latency, fetchedAt } = await fetchStateEffect(env, signal);
      const nextHistory = updateHistory(historyRef.current, next?.lastRiskScore);
      env.ui.apply({
        state: next,
        error: "",
        history: nextHistory,
        lastRefreshedAt: fetchedAt,
        latencyMs: latency
      });
    } catch (err) {
      if (signal.aborted) return;
      env.ui.apply({
        state: stateRef.current,
        error: normalizeError(err),
        history: historyRef.current,
        lastRefreshedAt: env.clock.nowIso(),
        latencyMs: null
      });
    }
  }, [fetchStateEffect]);

  const poller = useCallback<EffectType<DashboardEnv, void>>(async (env, signal) => {
    let nextHistory = historyRef.current;
    while (!signal.aborted) {
      try {
        const { next, latencyMs: latency, fetchedAt } = await Effect.retry(fetchStateEffect, {
          retries: 1,
          delayMs: 250
        })(env, signal);
        nextHistory = updateHistory(nextHistory, next?.lastRiskScore);
        env.ui.apply({
          state: next,
          error: "",
          history: nextHistory,
          lastRefreshedAt: fetchedAt,
          latencyMs: latency
        });
      } catch (err) {
        if (signal.aborted) return;
        env.ui.apply({
          state: stateRef.current,
          error: normalizeError(err),
          history: nextHistory,
          lastRefreshedAt: env.clock.nowIso(),
          latencyMs: null
        });
      }

      await Effect.sleep<DashboardEnv>(2000)(env, signal);
    }
  }, [fetchStateEffect]);

  useEffect(() => {
    const run = runtime.run(poller);
    return () => run.cancel();
  }, [runtime, poller]);

  const signals = useMemo(() => (state?.lastSignals ?? []).slice(), [state]);
  const decision = state?.lastDecision;
  const frame = state?.lastFrame;

  const filteredSignals = useMemo(() => {
    return signals
      .filter((s: any) => {
        if (sevFilter === "ALL") return true;
        return String(s?.severity ?? "") === sevFilter;
      })
      .filter((s: any) => {
        if (!riskOnly) return true;
        const hay = `${s?.agent ?? ""} ${s?.kind ?? ""} ${s?.summary ?? ""}`.toLowerCase();
        return hay.includes("risk") || hay.includes("liquidity") || hay.includes("credit");
      })
      .filter((s: any) => {
        if (!tickOnly) return true;
        return isSameTick(s?.createdAt, state?.lastTickAt);
      })
      .filter((s: any) => {
        if (!query.trim()) return true;
        const q = query.trim().toLowerCase();
        return (
          String(s?.agent ?? "").toLowerCase().includes(q) ||
          String(s?.kind ?? "").toLowerCase().includes(q) ||
          String(s?.summary ?? "").toLowerCase().includes(q)
        );
      })
      .slice(0, 25);
  }, [signals, sevFilter, query, riskOnly, tickOnly, state?.lastTickAt]);

  const positions = useMemo(() => (frame?.positions ?? []) as any[], [frame]);
  const totalValue = useMemo(() => {
    return positions.reduce((acc, p) => acc + Number(p?.value ?? 0), 0);
  }, [positions]);

  const datapoints = useMemo(() => (frame?.data ?? []) as any[], [frame]);

  const apiOk = Boolean(state?.ok) && !error;
  const selectedKey = selected ? signalKey(selected) : "";
  const escalationStatus = escalationLabel(state?.lastRiskScore, decision?.escalationRequired);
  const trend = trendDelta(history);
  const primaryAction = decision?.approvedActions?.[0];
  const riskMetrics = decision?.riskMetrics ?? [];
  const timeline = useMemo(() => {
    const items = (signals ?? []).map((s: any) => ({
      id: signalKey(s),
      createdAt: s?.createdAt,
      time: (s?.createdAt ?? "").slice(11, 19) || "—",
      severity: s?.severity ?? "INFO",
      title: s?.agent ?? "Agent",
      summary: s?.summary ?? "",
      kind: s?.kind ?? "SIGNAL",
    }));
    if (decision?.decisionId) {
      items.push({
        id: `decision-${decision.decisionId}`,
        createdAt: decision.createdAt,
        time: (decision.createdAt ?? "").slice(11, 19) || "—",
        severity: decision.escalationRequired ? "CRITICAL" : scoreToSev(decision.riskScore),
        title: "Decision",
        summary: decision.escalationRequired ? "Escalation required." : "Decision approved for execution path.",
        kind: "DECISION",
      });
    }
    return items.sort(timeSort);
  }, [signals, decision]);

  const consensusIndex = useMemo(() => {
    const map = new Map<string, any>();
    const consensus = decision?.consensus;
    if (!consensus) return map;
    [...(consensus.approved ?? []), ...(consensus.denied ?? []), ...(consensus.escalated ?? [])].forEach((entry: any) => {
      map.set(actionKey(entry.intent), entry);
    });
    return map;
  }, [decision]);

  const sortedSignals = useMemo(() => {
    return [...signals].sort((a: any, b: any) => severityRank(b?.severity) - severityRank(a?.severity));
  }, [signals]);
  const topSignals = sortedSignals.slice(0, 3);
  const remainingSignals = sortedSignals.slice(3);

  return (
    <div className="page">
      <div className="topbar">
        <div className="nav">
          <div className="brand">
            <div className="logo" />
            <div className="title">
              <h1>RWA Portfolio Manager</h1>
              <div className="sub">Risk Management Middleware · Demo Dashboard</div>
            </div>
          </div>

          <div className="toolbar">
            <span className="pill">
              <span className={`dot ${apiOk ? "" : "bad"}`} />
              API {apiOk ? "Connected" : "Disconnected"}
            </span>
            <span className="pill">
              <span className="mono">Latency</span>
              <span className="mono">{latencyMs == null ? "—" : `${latencyMs}ms`}</span>
            </span>
            <span className="pill">
              <span className="mono">Server</span>
              <span className="mono">{(state?.serverTime ?? "—").slice(11, 19)}</span>
            </span>
            <span className="pill">
              <span className="mono">Last refresh</span>
              <span className="mono">{fmtTimeShort(lastRefreshedAt)}</span>
            </span>
            <button
              className="btn"
              onClick={() => {
                const run = runtime.run(refreshOnce);
                run.promise.catch(() => undefined);
              }}
            >
              Refresh
            </button>
          </div>
        </div>
      </div>

      <div className="grid">
        {/* Summary Hero */}
        <section className="hero">
          <div className="card strong heroCard">
            <div className="cardHeader heroHeader">
              <div>
                <h2>Risk Score</h2>
                <div className="hint">Real-time risk posture</div>
              </div>
            </div>
            <div className="heroBody heroRiskBody">
              <div className="heroRiskLeft">
                <div className="heroRiskGaugeWrap">
                  <RiskGauge score={state?.lastRiskScore ?? 0} size={98} showLabel={false} />
                  <div className={`trend heroRiskTrend ${trend >= 0 ? "up" : "down"}`}>
                    {trend >= 0 ? "▲" : "▼"} {Math.abs(trend).toFixed(1)}
                  </div>
                </div>
              </div>
              <div className="heroRiskRight">
                <Sparkline values={history} />
                <div className="small">last 60 ticks</div>
              </div>
            </div>
          </div>

          <div className="card heroCard">
            <div className="cardHeader heroHeader">
              <div>
                <h2>Escalation</h2>
                <div className="hint">Policy gate status</div>
              </div>
              <span className="pill mono">{decision?.decisionId ? decision.decisionId.slice(0, 8) : "—"}</span>
            </div>
            <div className="statusBlock">
              <div className={`statusPill ${escalationStatus.toLowerCase()}`}>{escalationStatus}</div>
              <div className="statusBar">
                <div className={`statusFill ${escalationStatus.toLowerCase()}`} />
              </div>
              <div className="small">
                {decision?.escalationRequired ? "Human oversight required" : "Autonomy path within policy"}
              </div>
            </div>
          </div>

          <div className="card strong heroCard">
            <div className="cardHeader heroHeader">
              <div>
                <h2>Primary Next Action</h2>
                <div className="hint">Recommended execution focus</div>
              </div>
              <div className="pill mono">{primaryAction?.type ?? "—"}</div>
            </div>
            <div className="actionHero">
              <button className="btn primaryAction">
                {primaryAction?.type ?? "No action"}
              </button>
              <div className="small">
                {primaryAction?.reason ?? "No approved actions in the latest decision."}
              </div>
              <div className="chipRow">
                <span className="chip mono">{safeStr(primaryAction?.params ?? "—")}</span>
              </div>
            </div>
          </div>
        </section>

        {/* KPI Row */}
        <section className="kpis">
          <div className="card kpi soft">
            <div className="label">Last Tick</div>
            <div className="value">{fmtTime(state?.lastTickAt)}</div>
            <div className="meta mono">{state?.lastTickAt ? state.lastTickAt.slice(11, 19) : "—"}</div>
          </div>

          <div className="card kpi soft">
            <div className="label">Escalation</div>
            <div className="value">{decision ? (decision.escalationRequired ? "YES" : "NO") : "—"}</div>
            <div className="meta">{decision?.escalationRequired ? "Human oversight required" : "Bounded autonomy path"}</div>
          </div>

          <div className="card kpi soft">
            <div className="label">Signals (latest)</div>
            <div className="value">{signals.length}</div>
            <div className="meta">Showing top 25</div>
          </div>
        </section>

        {/* Main split */}
        <section className="split">
          <div className="card">
            <div className="cardHeader">
              <div>
                <h2>Decision</h2>
                <div className="hint">Consensus aggregation + policy gate</div>
              </div>
              <div className="pill mono">{decision?.decisionId ? decision.decisionId.slice(0, 8) : "—"}</div>
            </div>

            {decision ? (
              <>
                <div className="kv">
                  <div className="k">Decision ID</div>
                  <div className="v mono">{decision.decisionId}</div>

                  <div className="k">Created At</div>
                  <div className="v mono">{decision.createdAt}</div>

                  <div className="k">Escalation</div>
                  <div className="v">
                    <span className={`badge ${decision.escalationRequired ? "crit" : "info"}`}>
                      {decision.escalationRequired ? "YES" : "NO"}
                    </span>
                  </div>

                  <div className="k">Weights</div>
                  <div className="v mono">{decision.agentWeights ? "Reputation-adjusted" : "Static"}</div>
                </div>

                <div className="divider" />

                <div className="subsection">
                  <div className="subHeader">
                    <span className="label">Rationale</span>
                    <span className="small mono">Top signals</span>
                  </div>
                  <div className="signalList">
                    {topSignals.map((s: any) => (
                      <div className="signalItem" key={signalKey(s)}>
                        <span className={`badge ${sevClass(s?.severity ?? "INFO")}`}>{s?.severity ?? "INFO"}</span>
                        <div className="signalMain">
                          <div className="signalTitle">{s?.agent}</div>
                          <div className="signalSummary">{s?.summary}</div>
                        </div>
                        <div className="mono signalTime">{(s?.createdAt ?? "").slice(11, 19) || "—"}</div>
                      </div>
                    ))}
                    {topSignals.length === 0 ? <div className="small">No signals yet.</div> : null}
                  </div>
                  {remainingSignals.length ? (
                    <details className="accordion">
                      <summary className="pill" style={{ cursor: "pointer", userSelect: "none" }}>
                        Show all ({remainingSignals.length})
                      </summary>
                      <div className="signalList" style={{ marginTop: 10 }}>
                        {remainingSignals.map((s: any) => (
                          <div className="signalItem" key={signalKey(s)}>
                            <span className={`badge ${sevClass(s?.severity ?? "INFO")}`}>{s?.severity ?? "INFO"}</span>
                            <div className="signalMain">
                              <div className="signalTitle">{s?.agent}</div>
                              <div className="signalSummary">{s?.summary}</div>
                            </div>
                            <div className="mono signalTime">{(s?.createdAt ?? "").slice(11, 19) || "—"}</div>
                          </div>
                        ))}
                      </div>
                    </details>
                  ) : null}
                </div>

                <div className="divider" />

                <div className="subsection">
                  <div className="subHeader">
                    <span className="label riskDriversTitle">Risk Drivers</span>
                    <span className="small mono">{riskMetrics.length}</span>
                  </div>
                  <div className="metricGrid">
                    {riskMetrics.map((m: any, i: number) => (
                      <div className="metricCard" key={i}>
                        <div className="metricName">{m.name}</div>
                        <div className="metricValue">{Number(m.value ?? 0).toFixed(3)}</div>
                        <div className="small">{m.explanation}</div>
                      </div>
                    ))}
                    {riskMetrics.length === 0 ? <div className="small">No metrics yet.</div> : null}
                  </div>
                </div>

                {decision?.escalationReasons?.length ? (
                  <>
                    <div className="divider" />
                    <div className="subsection">
                      <div className="subHeader">
                        <span className="label">Escalation Reasons</span>
                      </div>
                      <ul className="bulletList">
                        {decision.escalationReasons.map((r: string, i: number) => (
                          <li key={i}>{r}</li>
                        ))}
                      </ul>
                    </div>
                  </>
                ) : null}

                {decision?.consensus ? (
                  <>
                    <div className="divider" />
                    <div className="subsection">
                      <div className="subHeader">
                        <span className="label">Consensus</span>
                        <span className="small mono">threshold {decision.consensus.thresholdWeight.toFixed(2)}</span>
                      </div>
                      <div className="consensusGrid">
                        <div className="consensusItem">
                          <div className="label">Approved</div>
                          <div className="value mono">{decision.consensus.approved.length}</div>
                        </div>
                        <div className="consensusItem">
                          <div className="label">Denied</div>
                          <div className="value mono">{decision.consensus.denied.length}</div>
                        </div>
                        <div className="consensusItem">
                          <div className="label">Escalate</div>
                          <div className="value mono">{decision.consensus.escalated.length}</div>
                        </div>
                      </div>
                    </div>
                  </>
                ) : null}

                <div className="divider" />

                <div className="split" style={{ gridTemplateColumns: "1fr 1fr" }}>
                  <div>
                    <div className="cardHeader" style={{ marginBottom: 8 }}>
                      <h2>Approved Actions</h2>
                      <div className="hint">{(decision.approvedActions ?? []).length}</div>
                    </div>
                    <div className="actions">
                      {(decision.approvedActions ?? []).map((a: any, i: number) => {
                        const consensus = consensusIndex.get(actionKey(a));
                        return (
                        <div className="actionItem" key={i}>
                          <div className="left">
                            <div className="type mono">{a.type}</div>
                            <div className="reason">{a.reason}</div>
                            <div className="chip mono">{safeStr(a.params)}</div>
                            {consensus ? (
                              <div className="small mono">
                                support {consensus.supportWeight.toFixed(2)} / oppose {consensus.opposeWeight.toFixed(2)}
                              </div>
                            ) : null}
                          </div>
                        </div>
                      )})}
                      {(decision.approvedActions ?? []).length === 0 ? (
                        <div className="small">No approved actions.</div>
                      ) : null}
                    </div>
                  </div>

                  <div>
                    <div className="cardHeader" style={{ marginBottom: 8 }}>
                      <h2>Denied Actions</h2>
                      <div className="hint">{(decision.deniedActions ?? []).length}</div>
                    </div>
                    <div className="actions">
                      {(decision.deniedActions ?? []).map((d: any, i: number) => {
                        const consensus = consensusIndex.get(actionKey(d.intent));
                        return (
                        <div className="actionItem" key={i}>
                          <div className="left">
                            <div className="type mono">{d.intent?.type ?? "—"}</div>
                            <div className="reason">{d.reason}</div>
                            <div className="chip mono">{safeStr(d.intent?.params)}</div>
                            {consensus ? (
                              <div className="small mono">
                                support {consensus.supportWeight.toFixed(2)} / oppose {consensus.opposeWeight.toFixed(2)}
                              </div>
                            ) : null}
                          </div>
                        </div>
                      )})}
                      {(decision.deniedActions ?? []).length === 0 ? (
                        <div className="small">No denied actions.</div>
                      ) : null}
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <div className="small">No decision yet.</div>
            )}

            {error ? <div className="small" style={{ color: "rgba(255,93,123,.9)", marginTop: 10 }}>{error}</div> : null}
          </div>

          <div className="card soft">
            <div className="cardHeader">
              <div>
                <h2>Decision Timeline</h2>
                <div className="hint">Chronological log of signals + decision</div>
              </div>
              <span className="pill mono">{timeline.length} events</span>
            </div>
            <div className="timeline">
              {timeline.length ? (
                timeline.map((t: any) => (
                  <div className="timelineRow" key={t.id}>
                    <div className={`timelineDot ${sevClass(t.severity)}`} />
                    <div className="timelineBody">
                      <div className="timelineHeader">
                        <span className="badge">{t.kind}</span>
                        <span className={`badge ${sevClass(t.severity)}`}>{t.severity}</span>
                        <span className="mono timelineTime">{t.time}</span>
                      </div>
                      <div className="timelineTitle">{t.title}</div>
                      <div className="timelineSummary">{t.summary}</div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="small">No timeline events yet.</div>
              )}
            </div>
          </div>

          <div className="card soft spanAll">
            <div className="cardHeader">
              <div>
                <h2>Observation Frame</h2>
                <div className="hint">Positions + data points used by agents</div>
              </div>
              <span className="pill mono">{(state?.lastObservedAt ?? "—").slice(11, 19)}</span>
            </div>

            <div style={{ marginBottom: 12 }}>
              <div className="pill" style={{ justifyContent: "space-between", width: "100%" }}>
                <span>Total Portfolio Value</span>
                <span className="mono">{totalValue.toFixed(2)}</span>
              </div>
            </div>

            <div style={{ marginBottom: 12 }}>
              <div className="cardHeader" style={{ marginBottom: 8 }}>
                <h2>Positions</h2>
                <div className="hint">{positions.length}</div>
              </div>
              <div className="positions">
                {positions.map((p: any, i: number) => {
                  const v = Number(p?.value ?? 0);
                  const pct = totalValue > 0 ? (v / totalValue) : 0;
                  return (
                    <div className="posRow" key={i}>
                      <div className="posLeft">
                        <div className="mono posName">{p.symbol}</div>
                        <div className="posTag">Tokenized Asset</div>
                        <div className="small mono">{p.assetId}</div>
                      </div>
                      <div className="posMid">
                        <div className="barWrap">
                          <div className="bar" style={{ width: `${Math.max(2, Math.round(pct * 100))}%` }} />
                        </div>
                        <div className="small">{Math.round(pct * 100)}% allocation</div>
                      </div>
                      <div className="posRight">
                        <div className="mono posValue">{v.toFixed(2)}</div>
                        <div className="small mono">price {Number(p.price ?? 0).toFixed(3)}</div>
                      </div>
                    </div>
                  );
                })}
                {positions.length === 0 ? <div className="small">No positions.</div> : null}
              </div>
            </div>

            <details>
              <summary className="pill" style={{ cursor: "pointer", userSelect: "none" }}>
                Data Points ({datapoints.length})
              </summary>
              <pre className="pre" style={{ marginTop: 10 }}>{JSON.stringify(datapoints, null, 2)}</pre>
            </details>
          </div>
        </section>

        {/* Signals */}
        <section className="card">
          <div className="cardHeader">
            <div>
              <h2>Signals (latest 25)</h2>
              <div className="hint">Search & click a row to inspect details</div>
            </div>
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
              <input
                className="input"
                placeholder="Search agent/kind/summary…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              <select className="select" value={sevFilter} onChange={(e) => setSevFilter(e.target.value)}>
                <option value="ALL">All severities</option>
                <option value="INFO">INFO</option>
                <option value="WARN">WARN</option>
                <option value="HIGH">HIGH</option>
                <option value="CRITICAL">CRITICAL</option>
              </select>
            </div>
          </div>

          <div className="chipBar">
            <button className={`chip ${sevFilter === "HIGH" ? "active" : ""}`} onClick={() => setSevFilter("HIGH")}>High</button>
            <button className={`chip ${sevFilter === "WARN" ? "active" : ""}`} onClick={() => setSevFilter("WARN")}>Warn</button>
            <button className={`chip ${riskOnly ? "active" : ""}`} onClick={() => setRiskOnly((v) => !v)}>Risk only</button>
            <button className={`chip ${tickOnly ? "active" : ""}`} onClick={() => setTickOnly((v) => !v)}>This tick</button>
            <button
              className="chip ghost"
              onClick={() => {
                setSevFilter("ALL");
                setRiskOnly(false);
                setTickOnly(false);
                setQuery("");
              }}
            >
              Reset
            </button>
          </div>

          <div className="table">
            <div className="thead">
              <div>Severity</div><div>Agent</div><div>Kind</div><div>Summary</div><div className="alignRight">Time</div>
            </div>

            {filteredSignals.length ? (
              filteredSignals.map((s: any, i: number) => (
                <div
                  className={`trow sev-${sevClass(s?.severity ?? "INFO")} ${selectedKey === signalKey(s) ? "selected" : ""}`}
                  key={i}
                  onClick={() => setSelected(s)}
                  title="Click to view details"
                >
                  <div><span className={`badge ${sevClass(s?.severity ?? "INFO")}`}>{s?.severity ?? "INFO"}</span></div>
                  <div className="mono ellipsis">{s.agent}</div>
                  <div className="mono">{s.kind}</div>
                  <div className="ellipsis" title={s.summary}>{s.summary}</div>
                  <div className="mono alignRight">{(s.createdAt ?? "").slice(11, 19) || "—"}</div>
                </div>
              ))
            ) : (
              <div style={{ padding: 12 }} className="small">No signals match your filter.</div>
            )}
          </div>
        </section>

        <div className="footer">
          <span>API: <span className="mono">/api/state</span> · Audit: <span className="mono">/api/audit?lines=200</span></span>
          <span className="mono">Tip: click a signal row → details drawer</span>
        </div>
      </div>

      {/* Drawer */}
      {selected ? (
        <div className="drawerOverlay" onClick={() => setSelected(null)}>
          <div className="drawer" onClick={(e) => e.stopPropagation()}>
            <div className="drawerTop">
              <div className="drawerTitle">
                <div className="h">Signal Details</div>
                <div className="s mono">{selected.agent} · {selected.kind} · {(selected.createdAt ?? "").slice(0, 19)}</div>
              </div>
              <button className="xbtn" onClick={() => setSelected(null)}>Close</button>
            </div>

            <div style={{ marginBottom: 10 }}>
              <span className={`badge ${sevClass(selected.severity ?? "INFO")}`}>{selected.severity ?? "INFO"}</span>
              <div className="divider" />
              <div className="rationale">{selected.summary}</div>
            </div>

            <div className="kv" style={{ marginBottom: 12 }}>
              <div className="k">Confidence</div>
              <div className="v mono">{fmtConfidence(selected.confidence)}</div>
              <div className="k">Risk Score</div>
              <div className="v mono">{Number.isFinite(selected.riskScore) ? selected.riskScore : "—"}</div>
              <div className="k">Stance</div>
              <div className="v mono">{selected.stance ?? "—"}</div>
            </div>

            {selected.reasons?.length ? (
              <div className="subsection">
                <div className="subHeader">
                  <span className="label">Reasons</span>
                </div>
                <ul className="bulletList">
                  {selected.reasons.map((r: string, i: number) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            {selected.evidence?.length ? (
              <div className="subsection">
                <div className="subHeader">
                  <span className="label">Evidence</span>
                </div>
                <ul className="bulletList">
                  {selected.evidence.map((e: any, i: number) => (
                    <li key={i}>
                      <span className="mono">{e.source}</span>
                      {e.ref ? ` · ${e.ref}` : ""}{e.detail ? ` · ${e.detail}` : ""}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {selected.constraintsTouched?.length ? (
              <div className="subsection">
                <div className="subHeader">
                  <span className="label">Constraints Touched</span>
                </div>
                <ul className="bulletList">
                  {selected.constraintsTouched.map((c: string, i: number) => (
                    <li key={i} className="mono">{c}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            <details open>
              <summary className="pill" style={{ cursor: "pointer", userSelect: "none" }}>Raw JSON</summary>
              <pre className="pre" style={{ marginTop: 10 }}>{JSON.stringify(selected, null, 2)}</pre>
            </details>
          </div>
        </div>
      ) : null}
    </div>
  );
}
