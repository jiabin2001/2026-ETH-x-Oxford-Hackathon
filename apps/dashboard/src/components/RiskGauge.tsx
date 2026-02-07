import React from "react";

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

function sev(score: number) {
  if (score >= 90) return "crit";
  if (score >= 75) return "high";
  if (score >= 60) return "warn";
  return "info";
}

export function RiskGauge(props: { score?: number; size?: number; showLabel?: boolean }) {
  const size = props.size ?? 92;
  const s = clamp(props.score ?? 0, 0, 100);
  const r = Math.round(s);
  const showLabel = props.showLabel ?? true;
  const stroke = 10;
  const radius = (size - stroke) / 2;
  const c = 2 * Math.PI * radius;
  const pct = s / 100;
  const dash = c * pct;
  const gap = c - dash;

  const level = sev(s);
  const label =
    level === "crit" ? "CRITICAL" :
    level === "high" ? "HIGH" :
    level === "warn" ? "WARN" : "INFO";

  return (
    <div style={{ display: "grid", placeItems: "center", gap: 8 }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <defs>
          <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="rgba(114,168,255,0.95)" />
            <stop offset="55%" stopColor="rgba(93,214,167,0.88)" />
            <stop offset="100%" stopColor="rgba(255,122,176,0.78)" />
          </linearGradient>
        </defs>

        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="rgba(120,140,220,0.18)"
          strokeWidth={stroke}
          fill="transparent"
        />

        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="url(#g)"
          strokeWidth={stroke}
          fill="transparent"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${gap}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />

        <text
          x="50%"
          y="50%"
          dominantBaseline="middle"
          textAnchor="middle"
          fill="rgba(231,233,238,0.95)"
          fontSize="18"
          fontWeight="700"
        >
          {r}
        </text>
      </svg>

      {showLabel ? <span className={`badge ${level}`}>{label}</span> : null}
    </div>
  );
}
