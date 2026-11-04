// 037 M1 (spec 037 FR-001): the title bar is placed from the TOP; the bottom reserve counts the bars only.
/**
 * Written BEFORE the change: red today (`titleBarTop`, `contentTopReserve`, `barsReserve` are not exported).
 * Option B (https://claude.ai/artifact/J7HKbsiAZoDFyypLbY9G9E): Back and actions in a row under the status bar, the large title
 * and its subtitle under that row, then the content. So a page needs room at the TOP for that block and, at the foot, only
 * for the bars (the tab bar is outside the page; the now bar floats over its foot).
 */
import { bars, contentTopReserve, nowBarBottom, titleBarTop, typeScale } from '@/design';
import { barsReserve } from '@/design/tokens';

describe('037 M1 title bar top', () => {
  it('the bar sits the safe area plus a 6 pt gap from the top', () => {
    expect(titleBarTop(47)).toBe(53);
    expect(titleBarTop(0)).toBe(6);
    expect(bars.titleTop).toBe(6);
  });

  it('the content leaves room for the row (44), the gap, the title (a line), its subtitle and a breath', () => {
    expect(contentTopReserve()).toBe(bars.titleBack + bars.titleTop + typeScale.hero.lineSafe + bars.titleSub + typeScale.caption.lineSafe + bars.sheetGap);
    expect(contentTopReserve()).toBeGreaterThan(bars.titleBack + typeScale.hero.lineSafe);
  });

  it('the bottom reserve on a pushed page with a now bar is the now bar\'s room only (no title part)', () => {
    expect(barsReserve({ now: true })).toBe(nowBarBottom(0) + bars.now + bars.sheetGap);
    // no bar under the page: only the breath, where the bottom title used to add 40+ (and a title row)
    expect(barsReserve({})).toBe(bars.sheetGap);
  });

  it('on a tab page the now bar floats nowGap over the tab bar, which the page does not include', () => {
    expect(barsReserve({ tabs: true, now: true })).toBe(bars.nowGap + bars.now + bars.sheetGap);
    expect(barsReserve({ tabs: true })).toBe(bars.sheetGap);
  });
});
