// Sheet with the community rules, shown once before a first comment: Accept or Not now.
/**
 * M21 US6 (G-M21-7). The server answers a comment (text or voice) with 428 `rules_required` until
 * the listener accepted the community rules. The page that tried to post shows the rules: a few
 * plain lines, then Accept (POST /v1/me/rules, then the page sends the comment again) or Not now
 * (nothing is sent; the rules come back next time). `RulesBody` is the content — the comment box
 * shows it in place of its form (no sheet over a sheet); `RulesSheet` is the same in its own
 * sheet, for the voice comment's mic.
 *
 * M31 W2-B (`social.html` `composerSheet({ rules })`, `comments--community-rules-voice`): in the composer the rules are a
 * raise card (radius 20, padding 16) with "Community rules" in Unbounded 800 22; in the voice sheet they sit on the sheet
 * with the title at 24. Each rule is a hot-text bullet and Geist 400 14/20 (the `quote` step: the step's 600 `compact` made the web
 * build 1-3 px wider per line, so lines the drawing keeps whole wrapped); "Accept" is a hot 48 pill and "Not now" a 14 tall text
 * action with a 48 pt tap. The drawing lists four rules; the app keeps its fifth, "Don't share anyone's private details." — a
 * real rule of the community guidelines (Settings, About) that the server's moderation uses; dropping it would hide a rule from
 * a first-time commenter, so the sheet is one rule (30 px) taller than drawn.
 */
import { useState } from 'react';
import { Box } from '@/ui/lib/box';
import { Pressable } from '@/ui/lib/pressable';
import { ActionSheet } from '@/ui/kit/ActionSheet';
import { PulseButton } from '@/ui/kit/PulseButton';
import { Type } from '@/ui/kit/Type';
import { useCommentExtrasApi } from '@/social/comment-extras-api';
import { COMMENTS } from './measures';

/** The short rules, in plain words. The full guidelines are in Settings → About. */
export const RULES: readonly string[] = [
  'Be kind. Talk about the episode, not the person.',
  'No hate, harassment, threats or sexual content.',
  'No spam, ads or links to make money.',
  "Don't share anyone's private details.",
  'Comments that break these rules may be hidden or removed.',
];

/** Drawn as a 14 tall text line under Accept; the 48 pt tap is its hitSlop. */
const NOT_NOW_SLOP = { top: 14, bottom: 20, left: 40, right: 40 };
const CARD = { borderRadius: COMMENTS.rulesRadius, padding: COMMENTS.rulesPad };

/** The rules and the two buttons — inside `RulesSheet`, or in place of the comment box's form. */
export function RulesBody(props: { onAccepted: () => void; onClose: () => void; /** On a raise card, as in the composer. */ card?: boolean }): React.ReactElement {
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
  const size = props.card ? 22 : 24;
  return (
    <Box style={{ gap: 14 }}>
      <Box className={`gap-row ${props.card ? 'bg-raise' : ''}`} style={props.card ? CARD : undefined}>
        <Type step="hero" className="text-text" accessibilityRole="header" style={{ fontSize: size, lineHeight: Math.ceil(size * 1.24) }}>Community rules</Type>
        {RULES.map((r) => (
          <Box key={r} className="flex-row" style={{ gap: 10 }}>
            <Type step="quote" className="text-hotText font-bold">•</Type>
            <Type step="quote" className="text-text flex-1">{r}</Type>
          </Box>
        ))}
      </Box>
      {error ? <Type step="note" className="text-hotText">{error}</Type> : null}
      <PulseButton label="Accept" accessibilityLabel="Accept the community rules" kind="hot" onPress={() => void accept()} busy={busy} full />
      <Pressable onPress={props.onClose} accessibilityRole="button" accessibilityLabel="Not now" hitSlop={NOT_NOW_SLOP} testID="rules-not-now" className="items-center justify-center" style={{ height: COMMENTS.cancelHeight }}>
        <Type step="compact" className="text-text2" style={{ lineHeight: COMMENTS.cancelHeight }}>Not now</Type>
      </Pressable>
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
    <ActionSheet open={props.open} onClose={props.onClose} label="Community rules">
      <RulesBody onAccepted={props.onAccepted} onClose={props.onClose} />
    </ActionSheet>
  );
}
