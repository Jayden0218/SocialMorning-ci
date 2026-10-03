// A white box with thin border that groups rows; plus the line between rows.
/**
 * M17 (contracts/ui-components.md, `Me-B` / `SettingsMore-B`): the Editorial card — a white
 * surface with a thin border and 16 pt corners, on the warm page. Rows inside are divided by
 * `CardDivider`. Decoration only: it adds no role, so a screen reader reads the rows inside.
 */
import { Box } from '@/ui/lib/box';

export function Card(props: { children: React.ReactNode; className?: string; padded?: boolean }): React.ReactElement {
  return (
    <Box className={`bg-surface border border-border rounded-row ${props.padded === false ? '' : 'px-section'} ${props.className ?? ''}`}>
      {props.children}
    </Box>
  );
}

/** The hairline between two rows in a card. */
export function CardDivider(): React.ReactElement {
  return <Box className="border-b-hairline border-separator" />;
}
