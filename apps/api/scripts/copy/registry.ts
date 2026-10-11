// Every lane's copy module, parents before children (listeners → episodes → comments → …): the copy and the way back use this order.
import { lane as ac } from './ac.ts';
import { lane as lb } from './lb.ts';
import { lane as sc } from './sc.ts';
import { lane as sg } from './sg.ts';
import { lane as pd } from './pd.ts';
import { lane as sf } from './sf.ts';
import { lane as st } from './st.ts';
import { lane as dv } from './dv.ts';
import type { LaneModule, TableSpec } from './types.ts';

export const MODULES: readonly LaneModule[] = [ac, lb, sc, sg, pd, sf, st, dv];

/** Every TableSpec, with the lane that owns it. */
export function allTables(modules: readonly LaneModule[] = MODULES): { lane: string; spec: TableSpec }[] {
  return modules.flatMap((m) => m.tables.map((spec) => ({ lane: m.lane, spec })));
}
