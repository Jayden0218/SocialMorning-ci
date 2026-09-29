import { Loading } from './States';

export function StatCard({ label, value, note }: { label: string; value: string | null; note?: string }) {
  return (
    <div className="stat">
      <div className="stat-label">{label}</div>
      {value === null ? <Loading lines={1} label={label} /> : <div className="stat-value num">{value}</div>}
      {note ? <div className="stat-note">{note}</div> : null}
    </div>
  );
}
