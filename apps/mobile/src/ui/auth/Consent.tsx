// The "I agree" tick box under sign-in, and the ask if not ticked.
/**
 * The consent checkbox under the sign-in form and the dialog that asks when it is not
 * ticked (owner's reference screenshots, 2026-09-27). The links open the full documents
 * in an overlay, as the Terms screen does. The ask is gluestack's Actionsheet (2026-10-03) and the
 * document overlay is gluestack's Modal at full size.
 */
import { useState } from 'react';
import { Pressable } from '@/ui/lib/pressable';
import { Modal, ModalBackdrop, ModalContent } from '@/ui/lib/modal';
import { Actionsheet, ActionsheetBackdrop, ActionsheetContent, ActionsheetDragIndicator, ActionsheetDragIndicatorWrapper } from '@/ui/lib/actionsheet';
import { Text } from '@/ui/lib/text';
import { Box } from '@/ui/lib/box';
import { hit } from '@/design';
import { LEGAL_TEXT } from '@/legal/texts';
import { LegalDoc } from '@/ui/shell/LegalDoc';
import { Icon, type IconName } from '@/ui/kit/Icon';
import { useStores } from '@/ui/shell/providers';
import { useColours } from '@/ui/kit/useColours';
import { display } from './display';
import { inkOn } from './AuthShell';

type Doc = 'agreement' | 'privacy';
const TAP = { minHeight: hit.min };
const BOX = { width: 22, height: 22 };
/** The sheet's document rows (56 pt) and its Agree pill (52 pt, `ConsentDialog-B`). */
const ROW = { minHeight: 56 };
const PILL = { minHeight: 52 };

function Links(props: { open: (d: Doc) => void }): React.ReactElement {
  return (
    <>
      <Text className="text-accent" onPress={() => props.open('agreement')} accessibilityRole="link">Service Agreement</Text>
      <Text className="text-muted"> and </Text>
      <Text className="text-accent" onPress={() => props.open('privacy')} accessibilityRole="link">Privacy Policy</Text>
    </>
  );
}

export function useLegalOverlay(): { open: (d: Doc) => void; overlay: React.ReactElement | null } {
  const [doc, setDoc] = useState<Doc | undefined>(undefined);
  return {
    open: setDoc,
    overlay: doc === undefined ? null : (
      <Modal isOpen size="full" onClose={() => setDoc(undefined)}>
        <ModalBackdrop />
        <ModalContent className="w-full h-full p-0 rounded-none border-0 bg-background">
          <LegalDoc text={LEGAL_TEXT[doc]} onClose={() => setDoc(undefined)} />
        </ModalContent>
      </Modal>
    ),
  };
}

export function ConsentRow(props: { agreed: boolean; onToggle: () => void; open: (d: Doc) => void }): React.ReactElement {
  return (
    <Box className="flex-row items-center gap-row mt-section">
      <Pressable
        onPress={props.onToggle}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: props.agreed }}
        accessibilityLabel="I have read and agree to the Service Agreement and Privacy Policy"
        className="justify-center"
        style={TAP}
      >
        <Box className={`rounded-sm border-2 items-center justify-center ${props.agreed ? 'bg-primary border-primary' : 'border-muted'}`} style={BOX}>
          {props.agreed ? <Text className="text-onPrimary text-xs font-bold">✓</Text> : null}
        </Box>
      </Pressable>
      <Text className="text-muted text-xs leading-[18px] flex-1">
        I have read and agree to the <Links open={props.open} />
      </Text>
    </Box>
  );
}

/**
 * The ask before signing in, when the box is not ticked. Owner, 2026-10-03 (reference
 * screenshot): a bottom sheet, not a centred card — a large serif title, one line, the two
 * documents as rows that open them, then Agree (full width) and Cancel (a text button).
 * Was an AlertDialog card (2026-09-29). The Agree button keeps its "Agree and <action>" name.
 *
 * M17 (`ConsentDialog-B`): the sheet is the warm page colour with white document rows (it was
 * the other way round), a 30 pt serif title, 8 pt between the rows, a 52 pt Agree pill and a
 * bold Cancel — as the Editorial sheet. Same actions, same names.
 */
export function ConsentDialog(props: { visible: boolean; action: string; onCancel: () => void; onAgree: () => void; open: (d: Doc) => void }): React.ReactElement {
  const stores = useStores();
  const c = useColours(stores.settings);
  const row = (d: Doc, icon: IconName, label: string): React.ReactElement => (
    <Pressable
      onPress={() => props.open(d)}
      accessibilityRole="link"
      accessibilityLabel={label}
      className="flex-row items-center gap-row px-section rounded-row border border-border bg-surface"
      style={ROW}
    >
      <Icon name={icon} size={20} color={c.accent} />
      <Text className="text-text text-body font-bold flex-1">{label}</Text>
      <Icon name="chevron-forward" size={18} color={c.muted} />
    </Pressable>
  );
  return (
    <Actionsheet isOpen={props.visible} onClose={props.onCancel}>
      <ActionsheetBackdrop accessibilityRole="button" accessibilityLabel="Close" />
      <ActionsheetContent className="bg-background rounded-t-artwork-lg px-screen-x pt-gap items-stretch" accessibilityViewIsModal>
        <ActionsheetDragIndicatorWrapper><ActionsheetDragIndicator /></ActionsheetDragIndicatorWrapper>
        <Text style={display(30, c.text, { leading: 34 })} className="text-text font-display mt-row" accessibilityRole="header">Before you continue</Text>
        <Text className="text-muted text-[15px] leading-[22px] mt-gap">Please read and agree to these two documents.</Text>
        <Box className="gap-gap mt-section">
          {row('agreement', 'document-text-outline', 'Service Agreement')}
          {row('privacy', 'shield-checkmark-outline', 'Privacy Policy')}
        </Box>
        <Pressable onPress={props.onAgree} accessibilityRole="button" accessibilityLabel={`Agree and ${props.action}`} className="items-center justify-center rounded-pill bg-primary mt-screen-x" style={PILL}>
          <Text className="text-onPrimary text-[15px] font-bold" style={{ color: inkOn(c) }}>Agree</Text>
        </Pressable>
        <Pressable onPress={props.onCancel} accessibilityRole="button" accessibilityLabel="Cancel" className="items-center justify-center mt-1 mb-row" style={TAP}>
          <Text className="text-accent text-body font-bold">Cancel</Text>
        </Pressable>
      </ActionsheetContent>
    </Actionsheet>
  );
}
