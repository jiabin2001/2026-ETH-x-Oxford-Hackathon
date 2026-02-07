import React, { useMemo } from "react";

export function Sparkline(props: { values: number[]; width?: number; height?: number }) {
  const width = props.width ?? 160;
  const height = props.height ?? 44;

  const d = useMemo(() => {
    const v = props.values.filter((x) => Number.isFinite(x));
    if (v.length < 2) return "";
    const min = Math.min(...v);
    const max = Math.max(...v);
    const span = Math.max(1e-9, max - min);

    return v
      .map((y, i) => {
        const x = (i / (v.length - 1)) * (width - 2) + 1;
        const yy = height - 2 - ((y - min) / span) * (height - 4);
        return `${i === 0 ? "M" : "L"} ${x.toFixed(2)} ${yy.toFixed(2)}`;
      })
      .join(" ");
  }, [props.values, width, height]);

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <path d={`M 1 ${height - 1} L ${width - 1} ${height - 1}`} stroke="rgba(120,140,220,0.16)" />
      {d ? (
        <path d={d} fill="none" stroke="rgba(114,168,255,0.90)" strokeWidth="2.2" strokeLinecap="round" />
      ) : null}
    </svg>
  );
}
