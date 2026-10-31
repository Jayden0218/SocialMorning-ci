// Writes a Reanimated shared value from a worklet or an effect, so the write is one small function.
/**
 * Writes a Reanimated shared value. Callable on the UI thread (it is a worklet) and from an effect;
 * a screen assigns through it so the write sits in one small function, not in the component body.
 */
export function setShared<T>(shared: { value: T }, next: T): void {
  'worklet';
  shared.value = next;
}
