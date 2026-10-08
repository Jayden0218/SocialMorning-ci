// Sheet with the community rules, shown once before a first comment: Accept or Not now.
/**
 * M21 US6 (G-M21-7). The server answers a comment (text or voice) with 428 `rules_required` until
 * the listener accepted the community rules. The page that tried to post shows the rules: a few
 * plain lines, then Accept (POST /v1/me/rules, then the page sends the comment again) or Not now
 * (nothing is sent; the rules come back next time). `RulesBody` is the content — the comment box
 * shows it in place of its form (no sheet over a sheet); `RulesSheet` is the same in its own
 * Actionsheet, for the voice comment's mic. Our own gluestack sheet — no native UI.
 */
import { useState } from 'react';
import { Pressable } from '@/ui/lib/pressable';
import { Text } from '@/ui/lib/text';
import { Heading } from '@/ui/lib/heading';
import { Box } from '@/ui/lib/box';
import { Actionsheet, ActionsheetBackdrop, ActionsheetContent, ActionsheetDragIndicator, ActionsheetDragIndicatorWrapper } from '@/ui/lib/actionsheet';
import { useCommentExtrasApi } from '@/social/comment-extras-api';
import { Eyebrow } from '@/ui/kit/Eyebrow';
import { hit } from '@/design';

const BUTTON = { minHeight: 52 };
const TAP = { minHeight: hit.min };

/** The short rules, in plain words. The full guidelines are in Settings → About. */
export const RULES: readonly string[] = [
  'Be kind. Talk about the episode, not the person.',
  'No hate, harassment, threats or sexual content.',
  'No spam, ads or links to make money.',
  "Don't share anyone's private details.",
  'Comments that break these rules may be hidden or removed.',
];

/** The rules and the two buttons — inside `RulesSheet`, or in place of the comment box's form. */
export function RulesBody(props: { onAccepted: () => void; onClose: () => void }): React.ReactElement {
  const extras = useCommentExtrasApi();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const accept = async () => {
    setBusy(true);
    setError(undefined);
    try {
      await extras.acceptRules();
      setBusy(false);
      props.onAccepted();
    } catch {
      setBusy(false);
      setError("Couldn't reach the server — try again.");
    }
  };
  return (
    <Box>
      <Eyebrow accent className="mt-gap">Before your first comment</Eyebrow>
      <Heading className="text-display font-display text-text mt-1" accessibilityRole="header">Community rules</Heading>
      <Box className="gap-gap mt-row">
        {RULES.map((r) => (
          <Box key={r} className="flex-row gap-gap">
            <Text className="text-accent text-body font-bold">•</Text>
            <Text className="text-text text-body flex-1">{r}</Text>
          </Box>
        ))}
      </Box>
      {error ? <Text className="text-accent text-meta mt-row">{error}</Text> : null}
      <Box className="gap-1 mt-section">
        <Pressable onPress={() => void accept()} disabled={busy} accessibilityRole="button" accessibilityLabel="Accept the community rules" accessibilityState={{ disabled: busy }} className={`items-center justify-center bg-primary rounded-pill ${busy ? 'opacity-50' : ''}`} style={BUTTON}>
          <Text className="text-onPrimary text-sm font-bold">Accept</Text>
        </Pressable>
        <Pressable onPress={props.onClose} accessibilityRole="button" accessibilityLabel="Not now" className="items-center justify-center" style={TAP}>
          <Text className="text-accent text-body font-bold">Not now</Text>
        </Pressable>
      </Box>
    </Box>
  );
}

export function RulesSheet(props: {
  open: boolean;
  /** Called after the server took the acceptance — the page sends the comment again. */
  onAccepted: () => void;
  /** Not now, or the sheet was closed: nothing is sent. */
  onClose: () => void;
}): React.ReactElement {
  return (
    <Actionsheet isOpen={props.open} onClose={props.onClose}>
      <ActionsheetBackdrop />
      <ActionsheetContent className="px-screen-x pt-row items-stretch" accessibilityViewIsModal>
        <ActionsheetDragIndicatorWrapper><ActionsheetDragIndicator /></ActionsheetDragIndicatorWrapper>
        <RulesBody onAccepted={props.onAccepted} onClose={props.onClose} />
      </ActionsheetContent>
    </Actionsheet>
  );
}
