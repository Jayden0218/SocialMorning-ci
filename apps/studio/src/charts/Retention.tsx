// Draws an episode's retention: the share of starters still listening at each minute.
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { palette } from '../tokens';

/**
 * M19 US12 (FR-070): x = minute, y = 0–100 %. The line is `accent` (clears 3:1 in both themes).
 * A table of the same numbers follows for screen readers.
 */
export function RetentionChart({ retention }: { retention: number[] }) {
  const p = palette();
  const data = retention.map((share, minute) => ({ minute, pct: Math.round(Math.max(0, Math.min(1, share)) * 1000) / 10 }));
  return (
    <figure style={{ margin: 0 }}>
      <div className="chart" aria-hidden="true">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
            <CartesianGrid stroke={p.separator} vertical={false} />
            <XAxis dataKey="minute" tickFormatter={(m) => `${m}m`} tick={{ fill: p.muted, fontSize: 12 }} axisLine={{ stroke: p.separator }} tickLine={false} minTickGap={24} />
            <YAxis domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tickFormatter={(v) => `${v}%`} tick={{ fill: p.muted, fontSize: 12 }} axisLine={false} tickLine={false} width={48} />
            <Tooltip
              formatter={(v) => [`${v}%`, 'Still listening']}
              labelFormatter={(m) => `Minute ${m}`}
              contentStyle={{ background: p.background, border: `1px solid ${p.separator}`, borderRadius: 10, color: p.text }}
            />
            <Line type="monotone" dataKey="pct" stroke={p.accent} strokeWidth={2.2} dot={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <table className="sr-only">
        <caption>Share of listeners still listening, by minute</caption>
        <thead><tr><th scope="col">Minute</th><th scope="col">Still listening</th></tr></thead>
        <tbody>{data.map((d) => <tr key={d.minute}><td>{d.minute}</td><td>{d.pct}%</td></tr>)}</tbody>
      </table>
    </figure>
  );
}
