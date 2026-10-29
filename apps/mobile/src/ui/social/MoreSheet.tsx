// A small "More" sheet: a title, a few Panel rows (Report, Stop suggesting…) and Cancel.
/**
 * M24 US1/US17: the status viewer, a chat message and a shared list each offer a short list of
 * actions on someone else's content. A row closes the sheet, then runs.
 *
 * M31 W3-D (design-pulse2 `lists--more-sheet`): the kit `ActionSheet` titled "More" (or the caller's
 * title), the rows as one Panel group (`PanelRow`, hot-text icon, chevron), then a quiet Cancel pill with
 * hot-text words. Same rows, names and handlers.
 */
import { ActionSheet } from '@/ui/kit/ActionSheet';
import { PanelRow } from '@/ui/kit/PanelRow';
import { PulseButton } from '@/ui/kit/PulseButton';
import { PanelGroup } from '@/ui/me/Panel';
import type { IconName } from '@/ui/kit/Icon';

/** `danger` draws the row's words in hot-text (Report, under the rule: `status--more-sheet`). */
export type MoreRow = { icon: IconName; label: string; onPress: () => void; danger?: boolean };

export function MoreSheet(props: { open: boolean; title: string; rows: readonly MoreRow[]; iconColour?: string; onClose: () => void }): React.ReactElement | null {
  return (
    <ActionSheet open={props.open} onClose={props.onClose} label={props.title} title={props.title}>
      <PanelGroup>
        {props.rows.map((r) => <PanelRow key={r.label} icon={r.icon} label={r.label} {...(r.danger === true ? { danger: true } : {})} onPress={() => { props.onClose(); r.onPress(); }} />)}
      </PanelGroup>
      <PulseButton label="Cancel" kind="quiet" hotWords full onPress={props.onClose} />
    </ActionSheet>
  );
}
