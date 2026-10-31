// A Panel: rows in one rounded group, a hairline between them.
/**
 * M31 T033 (design-pulse2 settings.html `group`, `div1`; the Me tab's four rows): one raise-filled
 * group with 22 corners and clipped edges, its rows divided by a 1 px `line` rule that starts 16 in
 * (the rows' own padding) and runs to the group's edge. The group adds no role: a screen reader reads
 * the rows. Children that are `null` or `false` are skipped, so a signed-out page draws no empty gap.
 */
import { Children, Fragment, type ReactNode } from 'react';
import { Box } from '@/ui/lib/box';
import { ME_MOSAIC } from './mosaic';

/** `tone="void"`: the group sits on a sheet, so it is filled with the page colour (design-pulse2 `consentSheet`: `group(rows, 'background:void')`). */
export function PanelGroup(props: { children: ReactNode; tone?: 'raise' | 'void' }): React.ReactElement {
  const rows = Children.toArray(props.children);
  return (
    <Box testID="panel-group" className={`${props.tone === 'void' ? 'bg-void' : 'bg-raise'} overflow-hidden`} style={{ borderRadius: ME_MOSAIC.radius }}>
      {rows.map((row, i) => (
        <Fragment key={i}>
          {i > 0 ? <Box testID="panel-rule" className="bg-line" style={{ height: 1, marginLeft: ME_MOSAIC.panelPad }} accessible={false} importantForAccessibility="no-hide-descendants" /> : null}
          {row}
        </Fragment>
      ))}
    </Box>
  );
}
