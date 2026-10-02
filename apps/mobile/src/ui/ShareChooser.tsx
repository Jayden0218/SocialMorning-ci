/**
 * The first step of Share (M12 FR-033/034). The episode page and the player opened the system
 * sheet with the publisher's raw .mp3 address (NEW-8, found on the iPhone). Now: share the
 * episode's SocialNet page, share this moment as a clip, or share a picture of the episode —
 * drawn by the server, downloaded here, and handed to the system sheet as a file. No audio.
 *
 * M16a T005 (FR-015, owner 2026-10-02): every Share in the app opens THIS panel first — the
 * app's own — and the iOS share sheet only behind its "More" row. `SharePanel` is the panel;
 * `useSharePanel` is how a page opens it for a show, a clip, a code or a file.
 */
import { useCallback, useState } from 'react';
import { Share } from 'react-native';
import { File, Paths } from 'expo-file-system';
import { Actionsheet, ActionsheetBackdrop, ActionsheetContent, ActionsheetDragIndicator, ActionsheetDragIndicatorWrapper } from './lib/actionsheet';
import { Pressable } from './lib/pressable';
import { Text } from './lib/text';
import { SheetRow } from './SheetRow';
import type { IconName } from './Icon';
import { hit } from '../design';
import { mmss } from './format';
import { useM12Api } from '../social/m12-api';
import { useStores, useToast } from './providers';
import { useColours } from './useColours';

const TAP = { minHeight: hit.min };

export function ShareChooser(props: {
  open: boolean;
  onClose: () => void;
  episode: { id: string; title: string; showTitle: string };
  atMs?: number;
  /** Opens the clip maker at this moment (the M4 flow). */
  onClip?: () => void;
  onShared?: () => void;
}): React.ReactElement {
  const m12 = useM12Api();
  const toast = useToast();
  const stores = useStores();
  const c = useColours(stores.settings);
  const shareLink = async () => {
    const url = m12.episodePageUrl(props.episode.id);
    try { await Share.share({ message: `${props.episode.title} — ${props.episode.showTitle}\n${url}`, url }); props.onShared?.(); } catch { /* dismissed */ }
  };
  const shareImage = async () => {
    // Phone walk 2026-09-30: the card took 10–16 s with nothing on screen; say it is coming.
    toast('Making the picture…');
    try {
      const target = new File(Paths.cache, `share-${props.episode.id}-${Date.now()}.png`);
      const file = await File.downloadFileAsync(m12.shareCardUrl(props.episode.id, props.atMs), target);
      await Share.share({ url: file.uri, message: props.episode.title });
      props.onShared?.();
    } catch {
      toast("Couldn't make the picture — try again when you're online.");
    }
  };

  const rows: ShareOption[] = [
    ...(props.onClip ? [{ icon: 'cut-outline' as const, label: 'Share this moment', ...(props.atMs !== undefined ? { detail: mmss(props.atMs) } : {}), onPress: props.onClip }] : []),
    { icon: 'image-outline', label: 'Share as image', onPress: () => void shareImage() },
  ];
  return <SharePanel open={props.open} onClose={props.onClose} rows={rows} more={{ detail: 'a link to its page', run: () => void shareLink() }} colour={c.text} />;
}

/** One of the app's own share options (a row above "More"). */
export type ShareOption = { icon: IconName; label: string; detail?: string; onPress: () => void };

/**
 * The app's share panel: its own options, then "More" — the only way to the system sheet — and
 * Cancel. Each row closes the panel first, then acts.
 */
export function SharePanel(props: {
  open: boolean;
  onClose: () => void;
  heading?: string;
  rows?: readonly ShareOption[];
  /** The system share sheet, behind "More". */
  more: { detail?: string; run: () => void };
  colour: string;
}): React.ReactElement {
  const close = (then: () => void) => { props.onClose(); then(); };
  return (
    <Actionsheet isOpen={props.open} onClose={props.onClose}>
      <ActionsheetBackdrop accessibilityRole="button" accessibilityLabel="Close" />
      {/* M16a T014: no fixed bottom padding — ActionsheetContent's own `pb-safe` clears the home indicator. */}
      <ActionsheetContent className="bg-background rounded-t-2xl px-screen-x pt-row items-stretch">
        <ActionsheetDragIndicatorWrapper><ActionsheetDragIndicator /></ActionsheetDragIndicatorWrapper>
        <Text className="text-sm font-bold text-text py-row" accessibilityRole="header">{props.heading ?? 'Share'}</Text>
        {(props.rows ?? []).map((r) => (
          <SheetRow key={r.label} icon={r.icon} label={r.label} {...(r.detail !== undefined ? { detail: r.detail } : {})} iconColour={props.colour} onPress={() => close(r.onPress)} />
        ))}
        <SheetRow icon="ellipsis-horizontal" label="More" {...(props.more.detail !== undefined ? { detail: props.more.detail } : {})} accessibilityLabel="More ways to share" iconColour={props.colour} onPress={() => close(props.more.run)} />
        <Pressable onPress={props.onClose} accessibilityRole="button" accessibilityLabel="Cancel" className="items-center justify-center mt-row" style={TAP}>
          <Text className="text-sm text-muted">Cancel</Text>
        </Pressable>
      </ActionsheetContent>
    </Actionsheet>
  );
}

export type ShareRequest = { heading?: string; rows?: readonly ShareOption[]; more: { detail?: string; run: () => void }; onClosed?: () => void };

/**
 * Opens the panel from anywhere on a page: `const [share, panel] = useSharePanel();` then
 * `share({ more: { run: () => void Share.share(…) } })` and render `{panel}`.
 */
export function useSharePanel(): [(request: ShareRequest) => void, React.ReactElement] {
  const stores = useStores();
  const c = useColours(stores.settings);
  const [request, setRequest] = useState<ShareRequest | undefined>();
  const open = useCallback((next: ShareRequest) => setRequest(next), []);
  const onClose = () => { const done = request?.onClosed; setRequest(undefined); done?.(); };
  const panel = (
    <SharePanel
      open={request !== undefined}
      onClose={onClose}
      {...(request?.heading !== undefined ? { heading: request.heading } : {})}
      rows={request?.rows ?? []}
      more={request?.more ?? { run: () => undefined }}
      colour={c.text}
    />
  );
  return [open, panel];
}
