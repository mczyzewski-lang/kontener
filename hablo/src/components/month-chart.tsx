"use client";

import { useState } from "react";

export interface DayPoint {
  date: string;
  minutes: number;
  reviews: number;
  newWords: number;
  independent: number;
}

/**
 * 30-day learning-minutes column chart: one series (accent), thin columns with
 * a rounded data end, hairline grid, hover/tap tooltip, and a table view.
 */
export function MonthChart({ days }: { days: DayPoint[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 600;
  const H = 160;
  const padL = 28;
  const padB = 20;
  const max = Math.max(10, ...days.map((d) => d.minutes));
  const top = Math.ceil(max / 10) * 10;
  const band = (W - padL) / days.length;
  const barW = Math.min(14, band - 2);
  const y = (v: number) => (H - padB) * (1 - v / top);
  const fmt = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("pl-PL", { day: "numeric", month: "short" });
  const h = hover !== null ? days[hover] : null;
  return (
    <figure>
      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Minuty nauki dziennie w ostatnich 30 dniach">
          {[0, top / 2, top].map((t) => (
            <g key={t}>
              <line x1={padL} x2={W} y1={y(t)} y2={y(t)} stroke="var(--color-line)" strokeWidth={1} />
              <text x={padL - 6} y={y(t) + 4} textAnchor="end" fontSize={11} fill="var(--color-muted)">
                {t}
              </text>
            </g>
          ))}
          {days.map((d, i) => {
            const x = padL + i * band + (band - barW) / 2;
            const hgt = (H - padB) - y(d.minutes);
            const r = Math.min(4, hgt / 2, barW / 2);
            return (
              <g key={d.date} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} onClick={() => setHover(i)}>
                <rect x={padL + i * band} y={0} width={band} height={H - padB} fill="transparent" />
                {d.minutes > 0 && (
                  <path
                    d={`M${x},${H - padB} V${y(d.minutes) + r} Q${x},${y(d.minutes)} ${x + r},${y(d.minutes)} H${x + barW - r} Q${x + barW},${y(d.minutes)} ${x + barW},${y(d.minutes) + r} V${H - padB} Z`}
                    fill="var(--color-accent)"
                    opacity={hover === null || hover === i ? 1 : 0.45}
                  />
                )}
              </g>
            );
          })}
          <text x={padL} y={H - 4} fontSize={11} fill="var(--color-muted)">
            {fmt(days[0].date)}
          </text>
          <text x={W} y={H - 4} fontSize={11} fill="var(--color-muted)" textAnchor="end">
            dziś
          </text>
        </svg>
        {h && (
          <div className="pointer-events-none absolute top-0 right-0 rounded-xl border border-line bg-surface px-3 py-2 text-xs shadow-sm">
            <div className="font-medium text-ink">{fmt(h.date)}</div>
            <div className="text-ink-2">{h.minutes} min nauki</div>
            <div className="text-muted">{h.reviews} powtórek · {h.newWords} nowych słów</div>
            <div className="text-muted">{h.independent} min samodzielnej rozmowy</div>
          </div>
        )}
      </div>
      <details className="mt-2 text-sm">
        <summary className="cursor-pointer text-muted">Tabela</summary>
        <table className="mt-2 w-full text-left text-xs tabular-nums">
          <thead className="text-muted">
            <tr>
              <th className="py-1 font-normal">Dzień</th>
              <th className="font-normal">Min</th>
              <th className="font-normal">Powtórki</th>
              <th className="font-normal">Nowe</th>
              <th className="font-normal">Rozmowa (samodz.)</th>
            </tr>
          </thead>
          <tbody>
            {days
              .filter((d) => d.minutes || d.reviews || d.newWords)
              .map((d) => (
                <tr key={d.date} className="border-t border-line">
                  <td className="py-1">{fmt(d.date)}</td>
                  <td>{d.minutes}</td>
                  <td>{d.reviews}</td>
                  <td>{d.newWords}</td>
                  <td>{d.independent}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
