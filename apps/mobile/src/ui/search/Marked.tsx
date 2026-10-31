// A name with the part you typed lit in the hot-text colour.
/**
 * Owner, 2026-10-01: on the Search page the part of a name that matches what was typed is drawn in the
 * accent colour (`splitMatch`). M31 T030 (split out of SearchPage.tsx, review D7): the lit part is the
 * Pulse hot-text (`hotText`, 8.5 on the page), the rest the text colour, in the type step the caller names.
 */
import { Platform } from 'react-native';
import { Text } from '@/ui/kit/Text';
import { Type } from '@/ui/kit/Type';
import type { TypeName } from '@/design';
import { splitMatch } from '@/search/match';

/**
 * M31 F2a: react-native-web gives every nested <span> its own `white-space: pre-wrap`, so a one-line name with a lit part wrapped to
 * two lines in a browser (found by the wave-2 capture) though `numberOfLines={1}` says one. Native Text honours it; on the web
 * the parts inherit the parent's `nowrap`. No effect on a phone.
 */
const WEB_INHERIT = Platform.OS === 'web' ? ({ whiteSpace: 'inherit' } as object) : undefined;

export function Marked(props: { text: string; term: string; step: TypeName; bold?: boolean; /** The unlit part's colour; the text colour unless said. */ tone?: 'text' | 'text2'; lines?: number; style?: React.ComponentProps<typeof Type>['style'] }): React.ReactElement {
  const text2 = props.tone === 'text2';
  const tone = text2 ? 'text-text2' : 'text-text';
  const line = props.bold ? (text2 ? 'text-text2 font-bold' : 'text-text font-bold') : tone;
  return (
    <Type step={props.step} className={line} numberOfLines={props.lines ?? 1} {...(props.style ? { style: props.style } : {})}>
      {splitMatch(props.text, props.term).map((s, i) => (
        <Text key={i} className={s.match ? 'text-hotText' : tone} {...(WEB_INHERIT && (props.lines ?? 1) === 1 ? { style: WEB_INHERIT } : {})}>{s.text}</Text>
      ))}
    </Type>
  );
}
