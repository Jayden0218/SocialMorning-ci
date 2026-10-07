// Admin page for translated transcripts: the shows that get them, today's Groq free-tier use, and the queue.
import { useState } from 'react';
import { api } from '../../api';
import { shortDate } from '../../format';
import { PageHead } from '../../shell/Page';
import { Empty, Failed, Loading } from '../../shell/States';
import { Table, type Column } from '../../shell/Table';
import { useLoad } from '../../useLoad';
import { errorText, Finder, type ShowCard } from './common';

type Allowed = { feedUrl: string; title: string | null; createdAt: string };
type ModelUse = { model: string; requests: number; audioS: number; tokens: number; budget: { requests: number; audioS?: number; tokens?: number } };
type Job = { episodeId: string; lang: string; state: string; title: string | null; error: string | null; requestedAt: string };

/**
 * M22 US13 (FR-038, FR-039): PLUS members can turn on Translation only for shows listed here.
 * Groq's free tier is shared and small (about 6 hour-long episodes a day), so the list stays short.
 * The server stops at 90 % of every free limit; the numbers below are today's (UTC).
 */
export function TranslationShows() {
  const [n, setN] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const shows = useLoad(() => api<{ items: Allowed[] }>('/v1/mod/translation-shows'), [n]);
  const usage = useLoad(() => api<{ day: string; models: ModelUse[]; queue: Job[] }>('/v1/mod/translation-usage'), [n]);
  const run = (p: Promise<unknown>) => { setError(null); p.then(() => setN((x) => x + 1), (e: unknown) => setError(errorText(e))); };
  const add = (feedUrl: string) => run(api(`/v1/mod/translation-shows/${encodeURIComponent(feedUrl)}`, { method: 'PUT' }));
  const remove = (feedUrl: string) => run(api(`/v1/mod/translation-shows/${encodeURIComponent(feedUrl)}`, { method: 'DELETE' }));
  const retry = (j: Job) => run(api('/v1/mod/translation-jobs/retry', { method: 'POST', body: { episodeId: j.episodeId, lang: j.lang } }));

  const showCols: Column<Allowed>[] = [
    { key: 'title', label: 'Show', render: (s) => s.title ?? s.feedUrl },
    { key: 'at', label: 'Added', render: (s) => shortDate(s.createdAt) },
    { key: 'act', label: 'Action', numeric: true, render: (s) => <button type="button" className="linkish" onClick={() => remove(s.feedUrl)}>Remove<span className="sr-only"> {s.title ?? s.feedUrl}</span></button> },
  ];
  const useCols: Column<ModelUse>[] = [
    { key: 'model', label: 'Model', render: (m) => m.model },
    { key: 'req', label: 'Requests', numeric: true, render: (m) => `${m.requests} / ${m.budget.requests}` },
    { key: 'amount', label: 'Audio seconds or tokens', numeric: true, render: (m) => (m.budget.audioS !== undefined ? `${m.audioS} / ${m.budget.audioS} s` : `${m.tokens} / ${m.budget.tokens ?? 0} tokens`) },
  ];
  const jobCols: Column<Job>[] = [
    { key: 'title', label: 'Episode', render: (j) => j.title ?? j.episodeId },
    { key: 'lang', label: 'Into', render: (j) => (j.lang === 'en' ? 'English' : 'Simplified Chinese') },
    { key: 'state', label: 'State', render: (j) => (j.error && j.state === 'failed' ? `failed — ${j.error}` : j.state) },
    { key: 'at', label: 'Asked', render: (j) => shortDate(j.requestedAt) },
    { key: 'act', label: 'Action', numeric: true, render: (j) => (j.state === 'failed' ? <button type="button" className="linkish" onClick={() => retry(j)}>Try again<span className="sr-only"> {j.title ?? j.episodeId}</span></button> : null) },
  ];
  return (
    <>
      <PageHead title="Translation" sub="Shows whose episodes PLUS members can read translated. Groq's free tier only — never a paid service." />
      {error ? <p className="error" role="alert">{error}</p> : null}
      <section className="card" aria-labelledby="tr-shows">
        <h2 id="tr-shows">Shows</h2>
        <Finder label="Add a show" kind="show" onPick={(x) => add((x as ShowCard).feedUrl)} />
        {shows.state === 'loading' ? <Loading lines={3} label="Shows" /> : null}
        {shows.state === 'error' ? <Failed message={shows.message} retry={shows.retry} /> : null}
        {shows.state === 'ready' && shows.data.items.length === 0 ? <Empty title="No shows yet">Add a foreign-language show to offer Translation on it.</Empty> : null}
        {shows.state === 'ready' && shows.data.items.length > 0 ? <Table caption="Shows offered Translation" columns={showCols} rows={shows.data.items} rowKey={(s) => s.feedUrl} /> : null}
      </section>
      <section className="card" aria-labelledby="tr-use">
        <h2 id="tr-use">Today{usage.state === 'ready' ? ` (${usage.data.day}, UTC)` : ''}</h2>
        {usage.state === 'loading' ? <Loading lines={2} label="Usage" /> : null}
        {usage.state === 'error' ? <Failed message={usage.message} retry={usage.retry} /> : null}
        {usage.state === 'ready' ? <Table caption="Groq use today against the 90 % budget" columns={useCols} rows={usage.data.models} rowKey={(m) => m.model} /> : null}
        {usage.state === 'ready' && usage.data.queue.length > 0 ? <Table caption="Translation queue" columns={jobCols} rows={usage.data.queue} rowKey={(j) => `${j.episodeId}:${j.lang}`} /> : null}
        {usage.state === 'ready' && usage.data.queue.length === 0 ? <p className="muted">Nothing is waiting.</p> : null}
      </section>
    </>
  );
}
