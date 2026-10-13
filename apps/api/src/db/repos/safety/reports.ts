// Stores reports with a copy of the reported item, hidden for the reporter.
/**
 * M6 reports (FR-001–FR-005, R7): one report per reporter per target (G3), a copy of the target at report time (G4), hidden for the reporter at once.
 */
import type { TargetKind } from '@socialmorning/social-core';
import { viaStore } from '../../backend.ts';

export type Snapshot = Record<string, unknown>;

/** M21 US2: the listener's correction of one transcript line (contracts/api.md). */
export type TranscriptDetail = { episodeId: string; offsetMs: number; original: string; suggested: string };

/** A transcript report's target id: one line of one episode, so the one-report-per-reporter key holds per line. */
export const transcriptTargetId = (episodeId: string, offsetMs: number): string => `${episodeId}#${offsetMs}`;

/** M24 US1: how many earlier messages a chat-message report keeps, so the admin reads it in context. */
export const CHAT_CONTEXT = 5;

export type CreateResult = { id: string; duplicate: boolean; closed?: 'already_gone' };

export type QueueRow = {
  id: string; target_kind: TargetKind; target_id: string; reporter_id: string | null; display_name: string | null;
  reason: string; note: string | null; snapshot: unknown; created_at: string; closed_at: string | null; close_reason: string | null;
};

/** M21 US2 (FR: a report reaches the show's host): one row of the Studio's transcript-reports list. */
export type TranscriptReport = { id: string; episodeId: string; episodeTitle: string; offsetMs: number; original: string; suggested: string; createdAt: string; status: 'open' | 'done' };

// DynamoDB bodies: ddb/reports.ts (db/backend.ts).
export const snapshotTarget = viaStore<typeof import('./ddb/reports.ts').snapshotTarget>('sf/reports', 'snapshotTarget');
export const createReport = viaStore<typeof import('./ddb/reports.ts').createReport>('sf/reports', 'createReport');
export const reportsInLastHour = viaStore<typeof import('./ddb/reports.ts').reportsInLastHour>('sf/reports', 'reportsInLastHour');
export const hiddenFor = viaStore<typeof import('./ddb/reports.ts').hiddenFor>('sf/reports', 'hiddenFor');
export const openReports = viaStore<typeof import('./ddb/reports.ts').openReports>('sf/reports', 'openReports');
export const closedReports = viaStore<typeof import('./ddb/reports.ts').closedReports>('sf/reports', 'closedReports');
export const closeReportsFor = viaStore<typeof import('./ddb/reports.ts').closeReportsFor>('sf/reports', 'closeReportsFor');
export const purgeClosedOlderThan = viaStore<typeof import('./ddb/reports.ts').purgeClosedOlderThan>('sf/reports', 'purgeClosedOlderThan');
export const transcriptReportsForFeed = viaStore<typeof import('./ddb/reports.ts').transcriptReportsForFeed>('sf/reports', 'transcriptReportsForFeed');
export const transcriptReportFeed = viaStore<typeof import('./ddb/reports.ts').transcriptReportFeed>('sf/reports', 'transcriptReportFeed');
export const markTranscriptReportDone = viaStore<typeof import('./ddb/reports.ts').markTranscriptReportDone>('sf/reports', 'markTranscriptReportDone');
