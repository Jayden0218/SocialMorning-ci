import { Area, AreaChart, Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { mmss } from '../format';
import { palette } from '../tokens';

/** The episode's 100-bucket reaction curve (0–1), over the episode's own length when known. */
export function HeatCurve({ heat, durationMs }: { heat: number[]; durationMs: number | null }) {
  const p = palette();
  const data = heat.map((v, i) => ({ i, v, at: durationMs ? mmss(Math.round((i / 100) * durationMs)) : `${i}%` }));
  const peak = data.reduce((a, b) => (b.v > a.v ? b : a), data[0] ?? { i: 0, v: 0, at: '' });
  return (
    <figure style={{ margin: 0 }}>
      <div className="chart" style={{ height: 180 }} aria-hidden="true">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
            <XAxis dataKey="at" tick={{ fill: p.muted, fontSize: 12 }} axisLine={{ stroke: p.separator }} tickLine={false} minTickGap={40} />
            <YAxis hide domain={[0, 1]} />
            <Tooltip formatter={(v) => [`${Math.round(Number(v) * 100)}%`, 'Reactions']} contentStyle={{ background: p.background, border: `1px solid ${p.separator}`, borderRadius: 10, color: p.text }} />
            <Area type="monotone" dataKey="v" stroke={p.accent} fill={p.primary} fillOpacity={0.35} strokeWidth={2} isAnimationActive={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <figcaption className="chart-note">
        {peak.v > 0 ? `Listeners react most around ${peak.at}.` : 'No reactions yet.'}
      </figcaption>
    </figure>
  );
}

export function MinuteBars({ items }: { items: { minute: number; count: number }[] }) {
  const p = palette();
  return (
    <figure style={{ margin: 0 }}>
      <div className="chart" style={{ height: 160 }} aria-hidden="true">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={items.map((m) => ({ ...m, label: `${m.minute}:00` }))} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
            <XAxis dataKey="label" tick={{ fill: p.muted, fontSize: 12 }} axisLine={{ stroke: p.separator }} tickLine={false} />
            <YAxis allowDecimals={false} tick={{ fill: p.muted, fontSize: 12 }} axisLine={false} tickLine={false} />
            <Tooltip formatter={(v) => [String(v), 'Comments']} contentStyle={{ background: p.background, border: `1px solid ${p.separator}`, borderRadius: 10, color: p.text }} />
            <Bar dataKey="count" fill={p.accent} radius={[4, 4, 0, 0]} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <table className="sr-only">
        <caption>Comments per minute</caption>
        <tbody>{items.map((m) => <tr key={m.minute}><td>{m.minute}:00</td><td>{m.count}</td></tr>)}</tbody>
      </table>
    </figure>
  );
}
