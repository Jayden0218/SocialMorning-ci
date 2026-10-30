// A small grey capital-letter label above a section.
/**
 * M17 (`Search-B`, `Following-B`): a section label — 11 pt bold capitals, spaced, in the muted
 * colour (or the accent for the section in focus). Spoken as a header.
 */
import { Text } from '@/ui/lib/text';

const CAPS = { letterSpacing: 1.3, textTransform: 'uppercase' as const };

export function Eyebrow(props: { children: string; accent?: boolean; className?: string }): React.ReactElement {
  return (
    <Text accessibilityRole="header" className={`${props.accent ? 'text-accent text-micro font-bold' : 'text-muted text-micro font-bold'} ${props.className ?? ''}`} style={CAPS}>
      {props.children}
    </Text>
  );
}
