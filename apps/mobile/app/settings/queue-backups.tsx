// Playlist backups: the last 10 versions of your playlist on this phone, each with Restore.
/**
 * M22 US4 (FR-016, spec scenario 3): Settings › Playback › Playlist backups. Each saved version
 * shows its date, the device it came from and its episode count; Restore asks once, then
 * replaces the playlist with it (the current one is saved first) and syncs it to the account
 * (src/sync/queue.ts `restore`). Versions are saved when the chooser keeps the other list, and
 * before a restore. Own header and confirm — no native iOS UI.
 */
import { useState } from 'react';
import { ScrollView } from '@/ui/lib/scroll-view';
import { Pressable } from '@/ui/lib/pressable';
import { Text } from '@/ui/lib/text';
import { Box } from '@/ui/lib/box';
import { plural } from '@socialmorning/social-core';
import { hit } from '@/design';
import { useQueueSync, useStores, useToast } from '@/ui/shell/providers';
import { PageHeader } from '@/ui/kit/PageHeader';
import { Card } from '@/ui/kit/Card';
import { EmptyPicture } from '@/ui/me/parts';
import { useConfirm } from '@/ui/kit/confirm';
import type { QueueBackup } from '@/storage/types';

const PILL = { minHeight: hit.min };

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
    <PageHeader title="Playlist backups" />
    <ScrollView className="flex-1 bg-background" contentContainerClassName="px-screen-x py-row pb-24 flex-grow">
      <Text className="text-muted text-body mb-section">The last 10 versions of your playlist on this phone.</Text>
      {rows.length === 0 ? <EmptyPicture icon="time-outline" line="No backups yet" /> : (
        <Card>
          {rows.map((b, i) => {
            const first = b.items[0] !== undefined ? stores.feeds.getEpisode(b.items[0])?.title : undefined;
            const label = `${when(b.createdAt)}, ${b.device ?? 'This phone'}, ${plural(b.items.length, 'episode')}`;
            return (
              <Box key={b.id} className={`py-row gap-1 ${i > 0 ? 'border-t-hairline border-separator' : ''}`}>
                <Text className="text-text text-body font-bold">{when(b.createdAt)}</Text>
                <Text className="text-muted text-meta">{`${b.device ?? 'This phone'} · ${plural(b.items.length, 'episode')}`}</Text>
                {first !== undefined ? <Text className="text-muted text-xs" numberOfLines={1}>{`Starts with ${first}`}</Text> : null}
                <Text className="text-muted text-xs">{WHY[b.reason]}</Text>
                <Pressable
                  onPress={busy === undefined ? () => restore(b) : undefined}
                  disabled={busy !== undefined}
                  accessibilityRole="button"
                  accessibilityLabel={`Restore the playlist from ${label}`}
                  accessibilityState={{ disabled: busy !== undefined, busy: busy === b.id }}
                  className="self-start items-center justify-center px-section mt-1 rounded-pill bg-primary"
                  style={PILL}
                >
                  <Text className="text-onPrimary text-body font-bold">{busy === b.id ? 'Restoring' : 'Restore'}</Text>
                </Pressable>
              </Box>
            );
          })}
        </Card>
      )}
    </ScrollView>
    {dialog}
    </>
  );
}
