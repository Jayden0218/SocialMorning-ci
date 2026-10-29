// The status bar's height, or 0 when no provider is above (the comment pages are drawn in tests without one).
import { useContext } from 'react';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';

export function useInsets(): { top: number } {
  const i = useContext(SafeAreaInsetsContext);
  return { top: i?.top ?? 0 };
}
