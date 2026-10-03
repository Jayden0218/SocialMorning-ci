// A card showing one number with its label, note and small line.
import { Loading } from './States';
import { Sparkline } from './Sparkline';

export function StatCard({ label, value, note, spark }: { label: string; value: string | null; note?: string; spark?: number[] }) {
  return (
    <div className="stat">
      <div className="stat-label">{label}</div>
      {value === null ? <Loading lines={1} label={label} /> : <div className="stat-value num">{value}</div>}
      {spark ? <Sparkline points={spark} /> : null}
      {note ? <div className="stat-note">{note}</div> : null}
    </div>
  );
}
