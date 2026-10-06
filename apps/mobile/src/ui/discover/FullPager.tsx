// Whole-screen pages swiped left and right (chart, search tabs, categories), kept in step with their tabs.
/**
 * M21 US7 (T085, T087, T088): a horizontal pager whose pages each fill the space it is given
 * (measured once laid out), so a page can hold its own vertical list. `index` moves it (a tab
 * was tapped); `onPage` reports a swipe. Pages are drawn lazily — the page shown and its two
 * neighbours are mounted, and a page stays mounted once it has been, so a swipe never lands on a
 * blank page and far pages do not load before they are near.
 */
import { useEffect, useRef, useState, type ComponentRef } from 'react';
import type { LayoutChangeEvent } from 'react-native';
import { ScrollView } from '@/ui/lib/scroll-view';
import { Box } from '@/ui/lib/box';

/** The page shown and its two neighbours. */
const near = (i: number): number[] => [i - 1, i, i + 1];

export function FullPager(props: { count: number; index: number; onPage: (i: number) => void; children: (i: number) => React.ReactNode }): React.ReactElement {
  const [size, setSize] = useState<{ width: number; height: number } | undefined>();
  const [seen, setSeen] = useState<ReadonlySet<number>>(() => new Set(near(props.index)));
  const scroller = useRef<ComponentRef<typeof ScrollView>>(null);
  useEffect(() => {
    setSeen((s) => (near(props.index).every((i) => s.has(i)) ? s : new Set([...s, ...near(props.index)])));
    if (size) scroller.current?.scrollTo?.({ x: props.index * size.width, animated: true });
  }, [props.index, size]);
  const layout = (e: LayoutChangeEvent): void => {
    const { width, height } = e.nativeEvent.layout;
    if (width > 0 && height > 0 && (width !== size?.width || height !== size?.height)) setSize({ width, height });
  };
  return (
    <Box className="flex-1" onLayout={layout}>
      {size ? (
        <ScrollView
          ref={scroller}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          contentOffset={{ x: props.index * size.width, y: 0 }}
          onMomentumScrollEnd={(e) => props.onPage(Math.round(e.nativeEvent.contentOffset.x / size.width))}
        >
          {Array.from({ length: props.count }, (_, i) => (
            <Box key={i} style={{ width: size.width, height: size.height }}>{seen.has(i) ? props.children(i) : null}</Box>
          ))}
        </ScrollView>
      ) : null}
    </Box>
  );
}
