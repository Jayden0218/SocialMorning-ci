import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { palette } from '../tokens';
import { axisDate, num } from '../format';

export type Point = { date: string; value: number };

/**
 * The line is `accent` (5.93 on white, 11.80 on dark — clears the 3:1 a graphic needs);
 * the yellow is only the fill under it, which carries no information by itself.
 * A table of the same numbers follows for screen readers.
 */
export function TrendChart({ points, label }: { points: Point[]; label: string }) {
  const p = palette();
  const max = Math.max(0, ...points.map((d) => d.value));
  return (
    <figure style={{ margin: 0 }}>
      <div className="chart" aria-hidden="true">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
            <defs>
              <linearGradient id="trend-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={p.primary} stopOpacity={0.55} />
                <stop offset="100%" stopColor={p.primary} stopOpacity={0.04} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke={p.separator} vertical={false} />
            <XAxis dataKey="date" tickFormatter={axisDate} tick={{ fill: p.muted, fontSize: 12 }} axisLine={{ stroke: p.separator }} tickLine={false} minTickGap={24} />
            <YAxis allowDecimals={false} domain={[0, max === 0 ? 4 : 'auto']} tick={{ fill: p.muted, fontSize: 12 }} axisLine={false} tickLine={false} width={48} />
            <Tooltip
              formatter={(v) => [num(Number(v)), label]}
              labelFormatter={(d) => String(d)}
              contentStyle={{ background: p.background, border: `1px solid ${p.separator}`, borderRadius: 10, color: p.text }}
            />
            <Area type="monotone" dataKey="value" stroke={p.accent} strokeWidth={2.2} fill="url(#trend-fill)" isAnimationActive={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <table className="sr-only">
        <caption>{label} per day</caption>
        <thead><tr><th scope="col">Day</th><th scope="col">{label}</th></tr></thead>
        <tbody>{points.map((d) => <tr key={d.date}><td>{d.date}</td><td>{d.value}</td></tr>)}</tbody>
      </table>
    </figure>
  );
}
