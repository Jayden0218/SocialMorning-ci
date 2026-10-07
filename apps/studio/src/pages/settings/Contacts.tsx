// Settings section for the show's contact links and the 100-hour message.
import { useEffect, useState } from 'react';
import { api, HttpError, type Show } from '../../api';
import { Failed, Loading } from '../../shell/States';
import { SaveBar, useDirty } from '../../shell/Unsaved';
import { useLoad } from '../../useLoad';
import type { Overrides } from '../Settings';

/** M14 US3 (FR-04): the same types and checks as the server; a link type must be https. */
export const CONTACT_TYPES = [
  { type: 'website', label: 'Website', hint: 'https://…', check: 'link' },
  { type: 'email', label: 'Email', hint: 'name@example.com', check: 'email' },
  { type: 'wechat', label: 'WeChat', hint: 'Your WeChat ID', check: 'id' },
  { type: 'wechat_official', label: 'WeChat Official Account', hint: 'The account ID', check: 'id' },
  { type: 'weibo', label: 'Weibo', hint: 'https://weibo.com/…', check: 'link' },
  { type: 'jike', label: 'Jike', hint: 'https://…', check: 'link' },
  { type: 'xiaohongshu', label: 'Xiaohongshu', hint: 'https://…', check: 'link' },
] as const;
const MAX = 6;

type Contact = { type: string; value: string };

export function contactProblem(c: Contact): string | null {
  const t = CONTACT_TYPES.find((x) => x.type === c.type);
  const v = c.value.trim();
  if (!t) return 'Choose a type.';
  if (!v) return 'Fill this in, or remove the row.';
  if (t.check === 'email') return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? null : 'Not an email address.';
  if (t.check === 'id') return /^[\w\-一-鿿]{1,50}$/.test(v) ? null : 'Letters, numbers, - or _ only (up to 50).';
  return /^https:\/\/\S+$/.test(v) ? null : 'Must start with https://';
}

type Form = { contacts: Contact[]; milestone: string };

/** Ways to reach the show, shown on the show page in the app; and the message after 100 hours of listening. */
export function Contacts({ show }: { show: Show }) {
  const o = useLoad(() => api<{ overrides: Overrides | null }>(`/v1/studio/shows/${show.key}/overrides`), [show.key]);
  const [saved, setSaved] = useState<Form>({ contacts: [], milestone: '' });
  const [f, setF] = useState<Form>(saved);
  const [busy, setBusy] = useState(false);
  const [tried, setTried] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const dirty = JSON.stringify(f) !== JSON.stringify(saved);
  useDirty(dirty);
  useEffect(() => {
    if (o.state !== 'ready') return;
    const v = { contacts: o.data.overrides?.contacts ?? [], milestone: o.data.overrides?.milestoneMessage ?? '' };
    setSaved(v); setF(v);
  }, [o.state]); // eslint-disable-line react-hooks/exhaustive-deps
  if (o.state === 'loading') return <Loading lines={4} />;
  if (o.state === 'error') return <div className="card"><Failed message={o.message} retry={o.retry} /></div>;

  const setRow = (i: number, patch: Partial<Contact>) => setF({ ...f, contacts: f.contacts.map((c, j) => (j === i ? { ...c, ...patch } : c)) });
  const problems = f.contacts.map(contactProblem);
  const save = async () => {
    setTried(true);
    if (problems.some(Boolean)) return setMsg({ ok: false, text: 'Fix the marked contacts first.' });
    setBusy(true); setMsg(null);
    const contacts = f.contacts.map((c) => ({ type: c.type, value: c.value.trim() }));
    try {
      await api(`/v1/studio/shows/${show.key}/overrides`, { method: 'PUT', body: { contacts: contacts.length ? contacts : null, milestoneMessage: f.milestone.trim() || null } });
      const next = { contacts, milestone: f.milestone.trim() };
      setSaved(next); setF(next); setTried(false);
      setMsg({ ok: true, text: 'Saved.' });
    } catch (e) { setMsg({ ok: false, text: e instanceof HttpError ? e.message : 'That did not save.' }); } finally { setBusy(false); }
  };
  const label = (type: string) => CONTACT_TYPES.find((t) => t.type === type)?.label ?? type;

  return (
    <div className="grid-2 settings-grid">
      <section className="card">
        {msg ? <p className={msg.ok ? 'muted' : 'error'} role={msg.ok ? 'status' : 'alert'}>{msg.text}</p> : null}
        <form onSubmit={(e) => { e.preventDefault(); void save(); }}>
          <h2>Contacts</h2>
          <p className="muted" style={{ marginTop: 0 }}>Listeners see these on your show page. Up to {MAX}.</p>
          {f.contacts.map((c, i) => {
            const t = CONTACT_TYPES.find((x) => x.type === c.type);
            const bad = tried ? problems[i] : null;
            return (
              <div className="toolbar" key={i} style={{ alignItems: 'flex-start' }}>
                <div className="field" style={{ margin: 0, flex: '0 0 200px' }}>
                  <label htmlFor={`ct-t-${i}`}>Type</label>
                  <select id={`ct-t-${i}`} className="select" value={c.type} onChange={(e) => setRow(i, { type: e.target.value })}>
                    {CONTACT_TYPES.map((x) => <option key={x.type} value={x.type}>{x.label}</option>)}
                  </select>
                </div>
                <div className="field" style={{ margin: 0, flex: '1 1 220px' }}>
                  <label htmlFor={`ct-v-${i}`}>{t?.label ?? 'Value'}</label>
                  <input id={`ct-v-${i}`} value={c.value} placeholder={t?.hint} maxLength={200} aria-invalid={bad ? true : undefined} aria-describedby={bad ? `ct-e-${i}` : undefined} onChange={(e) => setRow(i, { value: e.target.value })} />
                  {bad ? <span id={`ct-e-${i}`} className="error" style={{ fontSize: 13 }}>{bad}</span> : null}
                </div>
                <button type="button" className="linkish" style={{ marginTop: 30 }} onClick={() => setF({ ...f, contacts: f.contacts.filter((_, j) => j !== i) })}>Remove<span className="sr-only"> {t?.label}</span></button>
              </div>
            );
          })}
          {f.contacts.length < MAX
            ? <button type="button" className="btn btn-quiet" onClick={() => setF({ ...f, contacts: [...f.contacts, { type: 'website', value: '' }] })}>Add a contact</button>
            : <p className="muted">All {MAX} places are used.</p>}

          <h2 style={{ marginTop: 32 }}>Message after 100 hours</h2>
          <div className="field">
            <label htmlFor="ms">A thank-you a listener sees after 100 hours with your show</label>
            <input id="ms" maxLength={120} value={f.milestone} onChange={(e) => setF({ ...f, milestone: e.target.value })} placeholder="Thank you for 100 hours with us!" />
            <span className="muted num" style={{ fontSize: 13 }}>{f.milestone.length} of 120. Saved now; the app does not show it yet.</span>
          </div>
          <SaveBar dirty={dirty} busy={busy} onSave={() => { void save(); }} onReset={() => { setF(saved); setMsg(null); setTried(false); }} note="Saved contacts show on your show page." />
        </form>
      </section>
      <section className="card" aria-labelledby="ctp-h">
        <h2 id="ctp-h">Preview</h2>
        <h3 style={{ fontSize: 14, margin: '0 0 8px' }}>On your show page</h3>
        {f.contacts.length === 0 ? <p className="muted">No contacts yet.</p> : (
          <ul className="rows">
            {f.contacts.map((c, i) => (
              <li key={i}><div className="row-main"><div className="row-sub">{label(c.type)}</div><div className="row-title" style={{ overflowWrap: 'anywhere' }}>{c.value || '—'}</div></div></li>
            ))}
          </ul>
        )}
        <h3 style={{ fontSize: 14, margin: '20px 0 8px' }}>After 100 hours, on the listener's phone</h3>
        <div className="notify-card">
          <div className="app"><span>SocialMorning</span><span>now</span></div>
          <div className="t">100 hours with {show.title ?? 'your show'}</div>
          <div>{f.milestone.trim() || 'Your message appears here.'}</div>
        </div>
      </section>
    </div>
  );
}
