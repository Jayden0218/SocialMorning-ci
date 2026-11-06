// Playlist backups: the last 10 versions of your playlist on this phone, each with Restore.
/**
 * M22 US4 (FR-016, spec scenario 3): Settings › Playback › Playlist backups. Each saved version
 * shows its date, the device it came from and its episode count; Restore asks once, then
 * replaces the playlist with it (the current one is saved first) and syncs it to the account
 * (src/sync/queue.ts `restore`). Versions are saved when the chooser keeps the other list, and
 * before a restore. Own header and confirm — no native iOS UI.
 *
 * Spec 039 (List lane): a `Page` (Back + title); the spine and its dots are gone (design B: nothing sideways) — the versions are tiles one under the other, newest first.
 *
 * Before spec 039 (the page as M31 drew it, with a spine; the Spec 039 paragraph below is what the page is now) — M31 S-B (T060; design-pulse2 `settings-queue-backups--screen`, `--empty`, `--restore-dialog`, `toast--settings-queue-backups`; layout Thread): the
 * versions hang from a 2-wide spine (hot, violet at 60 %, then the line colour), newest first, a dot on it for each — the newest one hot —
 * and each is a tile: the date and time in mono 13, "device · n episodes", "Starts with …" in Geist 600 14, and at the foot the reason (12,
 * text-3) beside a quiet Restore pill (36; "Restoring" while busy, the others disabled meanwhile). The lede sits above; Restore asks first
 * (the kit dialog, a light action as nothing is lost). Empty is the kit's block. Same handlers, names and toasts.
 */
import { useState } from 'react';
import { plural } from '@socialmorning/social-core';
import { Box } from '@/ui/lib/box';
import { Type } from '@/ui/kit/Type';
import { useQueueSync, useStores, useToast } from '@/ui/shell/providers';
import { PageEmpty } from '@/ui/me/lists';
import { useConfirm } from '@/ui/kit/confirm';
import { Lede, Line, QuietPill, SettingsPage, Tile } from '@/ui/settings/panel';
import { SET, SET_TYPE } from '@/ui/settings/measures';
import type { QueueBackup } from '@/storage/types';

/** "7 Oct 2026, 14:05". */
function when(at: number): string {
  const d = new Date(at);
  return `${d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}, ${d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`;
}

const WHY: Record<QueueBackup['reason'], string> = {
  chooser: 'Not kept when you chose a playlist',
  restore: 'Saved before a restore',
  manual: 'Saved by you',
};

export default function QueueBackupsScreen(): React.ReactElement {
  const stores = useStores();
  const queueSync = useQueueSync();
  const toast = useToast();
  const [confirm, dialog] = useConfirm();
  const [rows, setRows] = useState<QueueBackup[]>(() => stores.queueBackups.list());
  const [busy, setBusy] = useState<number | undefined>();

  const restore = (b: QueueBackup) => confirm({
    title: 'Restore this playlist?',
    message: `Your playlist becomes these ${plural(b.items.length, 'episode')}. The one you have now is saved here first.`,
    action: 'Restore',
    onConfirm: () => {
      setBusy(b.id);
      void queueSync.restore(b.id)
        .then(() => toast('Playlist restored.'))
        .catch(() => toast("Couldn't restore the playlist."))
        .finally(() => { setBusy(undefined); setRows(stores.queueBackups.list()); });
    },
  });

  return (
    <>
    <SettingsPage title="Playlist backups">
      <Lede>The last 10 versions of your playlist on this phone.</Lede>
      {rows.length === 0 ? (
        <PageEmpty title="No backups yet" line="A backup is saved before a playlist is replaced." top={0} />
      ) : (
        <Box testID="backups-thread" style={{ gap: SET.threadGap }}>
          {rows.map((b) => {
            const first = b.items[0] !== undefined ? stores.feeds.getEpisode(b.items[0])?.title : undefined;
            const label = `${when(b.createdAt)}, ${b.device ?? 'This phone'}, ${plural(b.items.length, 'episode')}`;
            return (
              <Box key={b.id}>
                <Tile style={{ gap: SET.backupGap }}>
                  <Type step="mono" className="text-text" style={SET_TYPE.mono13}>{when(b.createdAt)}</Type>
                  <Line>{`${b.device ?? 'This phone'} · ${plural(b.items.length, 'episode')}`}</Line>
                  {first !== undefined ? <Type step="compact" className="text-text" numberOfLines={1}>{`Starts with ${first}`}</Type> : null}
                  <Box className="flex-row items-center" style={{ gap: SET.tileGap }}>
                    <Type step="caption" className="text-text3 font-normal flex-1">{WHY[b.reason]}</Type>
                    <QuietPill
                      label={busy === b.id ? 'Restoring' : 'Restore'}
                      onPress={busy === undefined ? () => restore(b) : undefined}
                      disabled={busy !== undefined}
                      busy={busy === b.id}
                      accessibilityLabel={`Restore the playlist from ${label}`}
                    />
                  </Box>
                </Tile>
              </Box>
            );
          })}
        </Box>
      )}
    </SettingsPage>
    {dialog}
    </>
  );
}
