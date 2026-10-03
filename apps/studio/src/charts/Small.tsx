// Small charts: daily subscribes and unsubscribes, and listening by hour.
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { axisDate } from '../format';
import { palette } from '../tokens';

/** Subscribes (accent) and unsubscribes (muted) per day. */
export function SubTrend({ points }: { points: { date: string; sub: number; unsub: number }[] }) {
  const p = palette();
  return (
    <figure style={{ margin: 0 }}>
      <div className="chart" aria-hidden="true">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
            <CartesianGrid stroke={p.separator} vertical={false} />
            <XAxis dataKey="date" tickFormatter={axisDate} tick={{ fill: p.muted, fontSize: 12 }} axisLine={{ stroke: p.separator }} tickLine={false} minTickGap={24} />
            <YAxis allowDecimals={false} tick={{ fill: p.muted, fontSize: 12 }} axisLine={false} tickLine={false} width={48} />
            <Tooltip contentStyle={{ background: p.background, border: `1px solid ${p.separator}`, borderRadius: 10, color: p.text }} />
            <Legend wrapperStyle={{ color: p.muted, fontSize: 13 }} />
            <Bar dataKey="sub" name="Subscribed" fill={p.accent} radius={[3, 3, 0, 0]} isAnimationActive={false} />
            <Bar dataKey="unsub" name="Unsubscribed" fill={p.muted} radius={[3, 3, 0, 0]} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <table className="sr-only">
        <caption>Subscribes and unsubscribes per day</caption>
        <thead><tr><th scope="col">Day</th><th scope="col">Subscribed</th><th scope="col">Unsubscribed</th></tr></thead>
        <tbody>{points.map((d) => <tr key={d.date}><td>{d.date}</td><td>{d.sub}</td><td>{d.unsub}</td></tr>)}</tbody>
      </table>
    </figure>
  );
}

export function HourBars({ hours }: { hours: number[] }) {
  const p = palette();
  const data = hours.map((n, h) => ({ h: `${h}:00`, n }));
  return (
    <figure style={{ margin: 0 }}>
      <div className="chart" style={{ height: 180 }} aria-hidden="true">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
            <XAxis dataKey="h" tick={{ fill: p.muted, fontSize: 11 }} axisLine={{ stroke: p.separator }} tickLine={false} interval={5} />
            <YAxis allowDecimals={false} tick={{ fill: p.muted, fontSize: 12 }} axisLine={false} tickLine={false} />
            <Tooltip formatter={(v) => [String(v), 'Listens']} contentStyle={{ background: p.background, border: `1px solid ${p.separator}`, borderRadius: 10, color: p.text }} />
            <Bar dataKey="n" fill={p.accent} radius={[3, 3, 0, 0]} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <table className="sr-only"><caption>Listens by hour</caption><tbody>{data.map((d) => <tr key={d.h}><td>{d.h}</td><td>{d.n}</td></tr>)}</tbody></table>
    </figure>
  );
}
