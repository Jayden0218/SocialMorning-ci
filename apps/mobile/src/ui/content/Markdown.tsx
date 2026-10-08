// Draws an Academy or Help body (the Markdown subset) as text — headings, paragraphs, lists, bold, https links — never as HTML.
/**
 * M25 A8, guard G-AC2 (content sanitising, phone half). Every run is a `<Text>` child: React Native
 * has no HTML, and nothing here would make any — a `<script>` in a body is drawn as those
 * characters. A link is only one the parser kept (it starts with https://) and opens in the browser.
 */
import { Linking } from 'react-native';
import type { MdBlock, MdInline } from '@socialmorning/social-core';
import { Text } from '@/ui/lib/text';
import { Box } from '@/ui/lib/box';

/** Plain runs are bare strings, so they take their parent <Text>'s colour and size. */
function Runs(props: { v: readonly MdInline[]; small?: boolean }): React.ReactElement {
  return (
    <>
      {props.v.map((x, i) => {
        if (x.t === 'bold') return <Text key={i} className={props.small ? 'text-muted font-bold' : 'text-text font-bold'}>{x.v}</Text>;
        if (x.t === 'link') {
          return (
            <Text key={i} className="text-accent underline" accessibilityRole="link" accessibilityLabel={x.v}
              onPress={() => { void Linking.openURL(x.href).catch(() => undefined); }}>{x.v}</Text>
          );
        }
        return x.v;
      })}
    </>
  );
}

/** `small`: the Help answer size (muted, meta). */
export function MarkdownBlocks(props: { blocks: readonly MdBlock[]; small?: boolean }): React.ReactElement {
  return (
    <Box className="gap-2">
      {props.blocks.map((b, i) => {
        if (b.t === 'h2') return <Text key={i} className="text-text text-title font-display" accessibilityRole="header"><Runs v={b.v} /></Text>;
        if (b.t === 'h3') return <Text key={i} className="text-text text-base font-display-semibold" accessibilityRole="header"><Runs v={b.v} /></Text>;
        if (b.t === 'p') return <Text key={i} selectable className={props.small ? 'text-muted text-meta leading-[20px]' : 'text-text text-body leading-[22px]'}><Runs v={b.v} small={props.small} /></Text>;
        return (
          <Box key={i} className="gap-1">
            {b.items.map((it, j) => (
              <Box key={j} className="flex-row gap-2">
                <Text className="text-accent text-body leading-[22px]">{b.t === 'ol' ? `${j + 1}.` : '•'}</Text>
                <Text selectable className={props.small ? 'flex-1 text-muted text-meta leading-[20px]' : 'flex-1 text-text text-body leading-[22px]'}><Runs v={it} small={props.small} /></Text>
              </Box>
            ))}
          </Box>
        );
      })}
    </Box>
  );
}
