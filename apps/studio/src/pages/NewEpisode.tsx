import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { api, HttpError, type Show } from '../api';
import { mmss } from '../format';
import { PageHead } from '../shell/Page';
import { DropZone } from '../shell/DropZone';
import { Failed, Loading } from '../shell/States';
import { useDirty } from '../shell/Unsaved';
import { audioDurationMs, mb, uploadFile } from '../upload';
import { useLoad } from '../useLoad';

type When = 'now' | 'schedule' | 'draft';
/** `datetime-local` wants local time without a zone: "2026-10-01T09:00". */
const localInput = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);

type Storage = { ready: boolean; usedBytes: number; ceilingBytes: number; maxAudioBytes: number };
const ACCEPT = 'audio/mpeg,audio/mp4,audio/x-m4a,audio/aac,.mp3,.m4a';

/**
 * M13 US2 — upload an episode's audio straight to storage, then publish it into the show's feed.
 * M14 US4 (FR-05): or save it as a draft (not in the feed), or schedule it (in the feed from its time); an optional cover.
 */
export function NewEpisode({ show }: { show: Show }) {
  const navigate = useNavigate();
  const storage = useLoad(() => api<Storage>('/v1/studio/storage'), []);
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [duration, setDuration] = useState<number | undefined>();
  const [pct, setPct] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [when, setWhen] = useState<When>('now');
  const [at, setAt] = useState(() => localInput(new Date(Date.now() + 86_400_000)));
  const [cover, setCover] = useState<string | null>(null);
  const [coverPct, setCoverPct] = useState<number | null>(null);
  useDirty(!busy && (file !== null || title.trim() !== '' || notes.trim() !== ''));

  if (!show.hosted) {
    return <><PageHead title="New episode" /><div className="card"><p>This show comes from your own feed. Publish new episodes where you host it; they appear here once listeners see them.</p><Link to={`/s/${show.key}/episodes`}>Back to episodes</Link></div></>;
  }
  if (storage.state === 'loading') return <Loading label="Storage" />;
  if (storage.state === 'error') return <div className="card"><Failed message={storage.message} retry={storage.retry} /></div>;
  const st = storage.data;
  const left = st.ceilingBytes - st.usedBytes;

  const pick = (f: File | null) => {
    setError(null); setFile(null); setDuration(undefined);
    if (!f) return;
    if (!/^audio\/(mpeg|mp4|x-m4a|aac)$/.test(f.type)) return setError('Choose an MP3 or M4A file.');
    if (f.size > st.maxAudioBytes) return setError(`That file is ${mb(f.size)}; the limit is ${mb(st.maxAudioBytes)}.`);
    if (f.size > left) return setError(`Not enough storage left: ${mb(left)} free.`);
    setFile(f);
    if (!title) setTitle(f.name.replace(/\.[^.]+$/, ''));
    void audioDurationMs(f).then(setDuration);
  };

  const pickCover = async (f: File) => {
    if (!/^image\/(jpeg|png)$/.test(f.type) || f.size > 5 * 1024 * 1024) return setError('Choose a JPEG or PNG cover under 5 MB.');
    setError(null); setCoverPct(0);
    try { setCover(await uploadFile(show.key, 'cover', f, setCoverPct)); }
    catch (e) { setError(e instanceof HttpError ? e.message : 'The cover did not upload.'); } finally { setCoverPct(null); }
  };

  const publish = async () => {
    if (!file) return;
    let publishAt: string | null = null;
    if (when === 'schedule') {
      const t = new Date(at).getTime();
      if (!(t > Date.now() && t <= Date.now() + 90 * 86_400_000)) return setError('Choose a time in the next 90 days.');
      publishAt = new Date(t).toISOString();
    }
    setBusy(true); setError(null); setPct(0);
    try {
      const audioUrl = await uploadFile(show.key, 'audio', file, setPct);
      const r = await api<{ episode: { episodeId: string } }>(`/v1/studio/shows/${show.key}/hosted-episodes`, {
        method: 'POST', body: {
          title: title.trim(), description: notes, audioUrl, durationMs: duration ?? null,
          status: when === 'draft' ? 'draft' : 'published', ...(publishAt ? { publishAt } : {}), ...(cover ? { coverUrl: cover } : {}),
        },
      });
      navigate(when === 'now' ? `/s/${show.key}/episodes/${r.episode.episodeId}` : `/s/${show.key}/episodes`, { replace: true });
    } catch (e) {
      setError(e instanceof HttpError ? e.message : 'The upload did not finish. Check your connection and try again — nothing was published.');
      setPct(null);
    } finally { setBusy(false); }
  };

  return (
    <>
      <p style={{ margin: '0 0 8px' }}><Link to={`/s/${show.key}/episodes`}>← Episodes</Link></p>
      <PageHead title="New episode" sub="Upload the audio, give it a title, then publish now, at a time you choose, or save a draft." />
      {!st.ready ? (
        <div className="banner" role="alert">Uploading is not switched on yet: the owner connects the audio store once in Vercel (Storage → socialmorning-episodes → Connect project, prefix EPISODES).</div>
      ) : null}
      <section className="card">
        {error ? <p className="error" role="alert">{error}</p> : null}
        <form onSubmit={(e) => { e.preventDefault(); void publish(); }}>
          <div className="field">
            <label htmlFor="ne-f">Audio file (MP3 or M4A, up to {mb(st.maxAudioBytes)})</label>
            <input id="ne-f" type="file" accept={ACCEPT} disabled={busy || !st.ready} onChange={(e) => pick(e.target.files?.[0] ?? null)} />
            {file ? <span className="muted num" style={{ fontSize: 13 }}>{file.name} · {mb(file.size)}{duration ? ` · ${mmss(duration)}` : ''}</span> : null}
          </div>
          <div className="field"><label htmlFor="ne-t">Title</label><input id="ne-t" required maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} /></div>
          <div className="field"><label htmlFor="ne-n">Shownotes (optional)</label><textarea id="ne-n" className="textarea" rows={6} maxLength={20000} value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
          <div className="field">
            <span style={{ fontWeight: 600, fontSize: 14 }}>Episode cover (optional — without one, the show's cover is used)</span>
            <DropZone label="Drop a cover here, or choose one" url={cover} busyPct={coverPct} size={112} onFile={(f) => { void pickCover(f); }} />
            {cover ? <button type="button" className="linkish" style={{ alignSelf: 'flex-start' }} onClick={() => setCover(null)}>Use the show's cover</button> : null}
          </div>
          <fieldset className="field" style={{ border: 0, padding: 0, margin: '0 0 16px' }}>
            <legend style={{ fontWeight: 600, fontSize: 14, marginBottom: 8 }}>When</legend>
            {([['now', 'Publish now'], ['schedule', 'Publish at a time'], ['draft', 'Save as a draft (not in your feed)']] as const).map(([v, l]) => (
              <label key={v} style={{ display: 'flex', gap: 8, alignItems: 'center', fontWeight: 500, minHeight: 32 }}>
                <input type="radio" name="when" value={v} checked={when === v} onChange={() => setWhen(v)} style={{ width: 18, height: 18 }} />{l}
              </label>
            ))}
            {when === 'schedule' ? (
              <div style={{ marginTop: 8 }}>
                <label htmlFor="ne-at" style={{ fontWeight: 500 }}>Date and time (your time zone)</label>
                <input id="ne-at" type="datetime-local" value={at} min={localInput(new Date())} max={localInput(new Date(Date.now() + 90 * 86_400_000))} onChange={(e) => setAt(e.target.value)} />
              </div>
            ) : null}
          </fieldset>
          {pct !== null ? (
            <div className="field" role="status" aria-live="polite">
              <span className="muted num">{pct < 100 ? `Uploading… ${pct}%` : 'Publishing…'}</span>
              <div className="bar-track" aria-hidden="true"><div className="bar-fill" style={{ width: `${pct}%` }} /></div>
            </div>
          ) : null}
          <button className="btn" type="submit" disabled={busy || !file || !title.trim() || !st.ready}>{busy ? 'Working…' : when === 'now' ? 'Upload and publish' : when === 'schedule' ? 'Upload and schedule' : 'Upload and save draft'}</button>
        </form>
        <p className="muted num" style={{ fontSize: 13, marginBottom: 0 }}>Storage: {mb(st.usedBytes)} of {mb(st.ceilingBytes)} used (the free plan's limit).</p>
      </section>
    </>
  );
}
