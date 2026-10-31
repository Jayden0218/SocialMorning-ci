// The hook behind every tapped outside link: opens it by the rules, and says "Can't open that link." when refused.
/** M31 T083. `openLink` (./openLink) decides; this adds the app's one toast for a refused link. */
import { useCallback, useContext } from 'react';
import { ToastContext } from '@/ui/shell/toast-context';
import { LINK_REFUSED, openLink, openSystem } from './openLink';

export function useOpenLink(): { open: (url: string) => Promise<void>; openOutside: (url: string) => Promise<boolean> } {
  const toast = useContext(ToastContext);
  const refused = useCallback(() => { toast?.(LINK_REFUSED); }, [toast]);
  const open = useCallback((url: string) => openLink(url, refused), [refused]);
  const openOutside = useCallback((url: string) => openSystem(url, refused), [refused]);
  return { open, openOutside };
}
