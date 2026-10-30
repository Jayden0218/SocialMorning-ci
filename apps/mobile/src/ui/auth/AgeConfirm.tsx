// The "I am 14 or older" tick box on the new-account step, and the "I am under 14" way out.
/**
 * M25 L3e: drawn under the name field on the email page's last step (a new account only). The
 * box is the same 22 pt box as the consent row (src/ui/auth/Consent.tsx), with a 48 pt tap area.
 * "I am under 14" shows the plain line in `UNDER_AGE_TEXT` and the page creates nothing.
 */
import { Pressable } from '@/ui/lib/pressable';
import { Text } from '@/ui/lib/text';
import { Box } from '@/ui/lib/box';
import { Icon } from '@/ui/kit/Icon';
import { useStores } from '@/ui/shell/providers';
import { useColours } from '@/ui/kit/useColours';
import { inkOn } from './AuthShell';
import { AGE_LINE, MIN_AGE } from './age';

const BOX = { width: 22, height: 22 };
const BOX_ROW = { height: 24 };
const BOX_SLOP = { top: 12, bottom: 12, left: 12, right: 12 };

export function AgeConfirm(props: { confirmed: boolean; onToggle: () => void; onUnder: () => void }): React.ReactElement {
  const c = useColours(useStores().settings);
  return (
    <Box className="mt-section gap-row">
      <Box className="flex-row items-center gap-row">
        <Pressable
          onPress={props.onToggle}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: props.confirmed }}
          accessibilityLabel={AGE_LINE}
          className="justify-center ml-3"
          style={BOX_ROW}
          hitSlop={BOX_SLOP}
        >
          <Box
            className={`rounded-sm border-2 items-center justify-center ${props.confirmed ? 'bg-primary border-primary' : 'border-muted'}`}
            style={BOX}
          >
            {props.confirmed ? <Icon name="checkmark" size={16} color={inkOn(c)} /> : null}
          </Box>
        </Pressable>
        <Text className="text-text text-body leading-[24px] flex-1" onPress={props.onToggle}>{AGE_LINE}</Text>
      </Box>
      <Pressable onPress={props.onUnder} accessibilityRole="button" accessibilityLabel={`I am under ${MIN_AGE}`} hitSlop={12} className="self-start ml-3">
        <Text className="text-accent text-meta font-bold">{`I am under ${MIN_AGE}`}</Text>
      </Pressable>
    </Box>
  );
}
