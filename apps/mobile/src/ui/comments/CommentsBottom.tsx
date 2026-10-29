// The thumb zone of the comments pages: a close or back circle with the title and count, the order capsule, the composer.
/**
 * M31 W2-B (`social.html` `commentsBase`, `composer`, `threadBase`; `index.html#comments--screen` notes "Bottom zone"). The
 * zone is 12 from each side and 6 over the home inset (the drawing's `bottom: 40`), 10 between its rows, over a fade:
 *   title row   a 44 raise circle (close ⌄ on Comments, back ‹ on Replies), the title in Unbounded 800 26 with the count in
 *               mono 14 (text3), padding 0 8
 *   capsule row a 40 track (raise, padding 3, 2 between) of 12-pt choices — the chosen one light with void words — and
 *               on Comments a 40 options circle (the Smart / Reverse sheet); it turns light when either is on
 *   composer    56, radius 22, raise2 with a 1 px line: the moment chip (it follows the playhead), the placeholder, a mic and
 *               an image; signed out it is one light 56 button "Sign in to join the conversation" with a lock
 * Each part is its own export so the two pages build the zone they draw.
 */
import { useWindowDimensions } from 'react-native';
import { Box } from '@/ui/lib/box';
import { Pressable } from '@/ui/lib/pressable';
import { Icon, type IconName } from '@/ui/kit/Icon';
import { IconButton } from '@/ui/kit/PulseButton';
import { TimestampChip } from '@/ui/kit/TimestampChip';
import { Type } from '@/ui/kit/Type';
import { colour } from '@/design';
import { COMMENTS } from './measures';
import { drawnType } from '@/design/type-px';

/** The zone's frame: where it sits and how its rows are spaced. */
export function BottomZone(props: { bottom: number; children: React.ReactNode }): React.ReactElement {
  return (
    <Box className="absolute" style={{ left: COMMENTS.zoneSide, right: COMMENTS.zoneSide, bottom: props.bottom, gap: COMMENTS.zoneGap, zIndex: 30 }} testID="comments-zone">
      {props.children}
    </Box>
  );
}

export function ZoneTitle(props: { title: string; /** The drawn size of the title when it is not the comments pages' 26 (the Like page: 24). */ size?: number; count?: number | undefined; back: { icon: IconName; label: string; onPress: () => void }; /** At the row's right end: the Replies page's All / Newest capsule. */ right?: React.ReactNode }): React.ReactElement {
  const { fontScale } = useWindowDimensions();
  return (
    <Box className="flex-row items-end" style={{ gap: COMMENTS.zoneGap, paddingHorizontal: COMMENTS.titleRowPad }} testID="comments-title-row">
      <IconButton icon={props.back.icon} label={props.back.label} onPress={props.back.onPress} fill />
      <Box className="flex-1 flex-row items-end" style={{ gap: 6 }}>
        <Type step="hero" className="text-text" accessibilityRole="header" numberOfLines={fontScale > 1.3 && /\s/.test(props.title.trim()) ? 2 : 1} adjustsFontSizeToFit={fontScale > 1.3} minimumFontScale={0.6} style={{ fontSize: props.size ?? COMMENTS.titleSize, lineHeight: props.size === undefined ? COMMENTS.titleLine : Math.round((props.size * COMMENTS.titleLine) / COMMENTS.titleSize) }}>{props.title}</Type>
        {props.count !== undefined && props.count > 0 ? <Type step="mono" className="text-text3" style={drawnType.commentCount}>{props.count}</Type> : null}
      </Box>
      {props.right}
    </Box>
  );
}

/** Two to four choices on a 40 raise track; the chosen one is light. */
export function Capsule<T extends string>(props: {
  items: readonly { value: T; label: string; accessibilityLabel?: string }[];
  value: T;
  onChange: (v: T) => void;
  /** Items hug their words with this much padding (Replies: 14) instead of sharing the width. */
  hug?: boolean;
}): React.ReactElement {
  return (
    <Box
      accessibilityRole="tablist"
      className={`flex-row bg-raise rounded-pill ${props.hug ? '' : 'flex-1'}`}
      style={{ height: COMMENTS.capsuleHeight, padding: COMMENTS.capsulePad, gap: COMMENTS.capsuleGap }}
      testID="comments-capsule"
    >
      {props.items.map((it) => {
        const on = it.value === props.value;
        return (
          <Pressable
            key={it.value}
            onPress={() => props.onChange(it.value)}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            accessibilityLabel={it.accessibilityLabel ?? it.label}
            hitSlop={{ top: 7, bottom: 7 }}
            className={`items-center justify-center ${props.hug ? '' : 'flex-1'} ${on ? 'bg-text' : ''}`}
            style={{ borderRadius: COMMENTS.capsuleItemRadius, ...(props.hug ? { paddingHorizontal: COMMENTS.capsuleItemPad } : null) }}
          >
            <Type step="chip" className={on ? 'text-void' : 'text-text2'} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{it.label}</Type>
          </Pressable>
        );
      })}
    </Box>
  );
}

const BAR = { minHeight: COMMENTS.composerHeight, borderRadius: COMMENTS.composerRadius, paddingHorizontal: COMMENTS.composerPad, gap: 6, borderWidth: 1 };

/** The write bar: tap anywhere on the words to open the composer; the mic slot and the image button sit inside it. */
export function ComposerBar(props: {
  /** "14:32" — the moment chip (the replies page has none). */
  moment?: string | undefined;
  placeholder: string;
  accessibilityLabel: string;
  onOpen: () => void;
  /** The mic (VoiceComposer's), drawn at the right. */
  mic: React.ReactNode;
  /** Adds a picture (hidden when pictures are off, or on the replies page). */
  onImage?: (() => void) | undefined;
}): React.ReactElement {
  return (
    <Box className="flex-row items-center bg-raise2 border-line" style={BAR} testID="comments-composer">
      <Pressable onPress={props.onOpen} accessibilityRole="button" accessibilityLabel={props.accessibilityLabel} className="flex-1 flex-row items-center" style={{ gap: 6, minHeight: COMMENTS.composerHeight }}>
        {props.moment ? <Box><TimestampChip text={props.moment} /></Box> : null}
        <Type step="note" className="text-text3 flex-1" numberOfLines={1} style={{ paddingLeft: 4 }}>{props.placeholder}</Type>
      </Pressable>
      {props.mic}
      {props.onImage ? <IconButton icon="image-outline" label="Add a picture" onPress={props.onImage} size={22} /> : null}
    </Box>
  );
}

/** Signed out: one light button where the composer is. */
export function SignInBar(props: { label: string; onPress: () => void }): React.ReactElement {
  return (
    <Pressable onPress={props.onPress} accessibilityRole="button" accessibilityLabel={props.label} className="flex-row items-center justify-center bg-text" style={{ height: COMMENTS.composerHeight, borderRadius: COMMENTS.composerRadius, gap: 8 }} testID="comments-signin">
      <Icon name="lock-closed-outline" size={18} color={colour.void} />
      <Type step="row" className="text-void font-bold">{props.label}</Type>
    </Pressable>
  );
}
