import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { api, HttpError, type Show } from '../api';
import { mmss } from '../format';
import { PageHead } from '../shell/Page';
import { Failed, Loading } from '../shell/States';
import { audioDurationMs, mb, uploadFile } from '../upload';
import { useLoad } from '../useLoad';

type Storage = { ready: boolean; usedBytes: number; ceilingBytes: number; maxAudioBytes: number };
const ACCEPT = 'audio/mpeg,audio/mp4,audio/x-m4a,audio/aac,.mp3,.m4a';

/** M13 US2 — upload an episode's audio straight to storage, then publish it into the show's feed. */
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

  const publish = async () => {
    if (!file) return;
    setBusy(true); setError(null); setPct(0);
    try {
      const audioUrl = await uploadFile(show.key, 'audio', file, setPct);
      const r = await api<{ episode: { episodeId: string } }>(`/v1/studio/shows/${show.key}/hosted-episodes`, {
        method: 'POST', body: { title: title.trim(), description: notes, audioUrl, durationMs: duration ?? null },
      });
      navigate(`/s/${show.key}/episodes/${r.episode.episodeId}`, { replace: true });
    } catch (e) {
      setError(e instanceof HttpError ? e.message : 'The upload did not finish. Check your connection and try again — nothing was published.');
      setPct(null);
    } finally { setBusy(false); }
  };

  return (
    <>
      <p style={{ margin: '0 0 8px' }}><Link to={`/s/${show.key}/episodes`}>← Episodes</Link></p>
      <PageHead title="New episode" sub="Upload the audio, give it a title, publish. It is in your show's feed at once." />
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
          {pct !== null ? (
            <div className="field" role="status" aria-live="polite">
              <span className="muted num">{pct < 100 ? `Uploading… ${pct}%` : 'Publishing…'}</span>
              <div className="bar-track" aria-hidden="true"><div className="bar-fill" style={{ width: `${pct}%` }} /></div>
            </div>
          ) : null}
          <button className="btn" type="submit" disabled={busy || !file || !title.trim() || !st.ready}>{busy ? 'Working…' : 'Upload and publish'}</button>
        </form>
        <p className="muted num" style={{ fontSize: 13, marginBottom: 0 }}>Storage: {mb(st.usedBytes)} of {mb(st.ceilingBytes)} used (the free plan's limit).</p>
      </section>
    </>
  );
}
