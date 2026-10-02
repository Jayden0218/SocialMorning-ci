/**
 * The consent checkbox under the sign-in form and the dialog that asks when it is not
 * ticked (owner's reference screenshots, 2026-09-27). The links open the full documents
 * in an overlay, as the Terms screen does. The ask is gluestack's Actionsheet (2026-10-03) and the
 * document overlay is gluestack's Modal at full size.
 */
import { useState } from 'react';
import { Pressable } from '../lib/pressable';
import { Modal, ModalBackdrop, ModalContent } from '../lib/modal';
import { Actionsheet, ActionsheetBackdrop, ActionsheetContent, ActionsheetDragIndicator, ActionsheetDragIndicatorWrapper } from '../lib/actionsheet';
import { Text } from '../lib/text';
import { Box } from '../lib/box';
import { hit } from '../../design';
import { LEGAL_TEXT } from '../../legal/texts';
import { LegalDoc } from '../LegalDoc';
import { Icon, type IconName } from '../Icon';
import { useStores } from '../providers';
import { useColours } from '../useColours';
import { display } from './display';

type Doc = 'agreement' | 'privacy';
const TAP = { minHeight: hit.min };
const BOX = { width: 22, height: 22 };
/** The sheet's document rows and its Agree button. */
const ROW = { minHeight: 56 };

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
 */
export function ConsentDialog(props: { visible: boolean; action: string; onCancel: () => void; onAgree: () => void; open: (d: Doc) => void }): React.ReactElement {
  const stores = useStores();
  const c = useColours(stores.settings);
  const row = (d: Doc, icon: IconName, label: string): React.ReactElement => (
    <Pressable
      onPress={() => props.open(d)}
      accessibilityRole="link"
      accessibilityLabel={label}
      className="flex-row items-center gap-row px-section rounded-artwork border border-separator bg-background"
      style={ROW}
    >
      <Icon name={icon} size={20} color={c.accent} />
      <Text className="text-text text-sm font-semibold flex-1">{label}</Text>
      <Icon name="chevron-forward" size={18} color={c.muted} />
    </Pressable>
  );
  return (
    <Actionsheet isOpen={props.visible} onClose={props.onCancel}>
      <ActionsheetBackdrop accessibilityRole="button" accessibilityLabel="Close" />
      <ActionsheetContent className="bg-background rounded-t-2xl px-screen-x pt-row items-stretch" accessibilityViewIsModal>
        <ActionsheetDragIndicatorWrapper><ActionsheetDragIndicator /></ActionsheetDragIndicatorWrapper>
        <Text style={display(32, c.text)} className="mt-row" accessibilityRole="header">Before you continue</Text>
        <Text className="text-muted text-sm mt-gap">Please read and agree to these two documents.</Text>
        <Box className="gap-row mt-section">
          {row('agreement', 'document-text-outline', 'Service Agreement')}
          {row('privacy', 'shield-checkmark-outline', 'Privacy Policy')}
        </Box>
        <Pressable onPress={props.onAgree} accessibilityRole="button" accessibilityLabel={`Agree and ${props.action}`} className="items-center justify-center rounded-pill bg-primary mt-screen-x" style={ROW}>
          <Text className="text-onPrimary text-sm font-semibold">Agree</Text>
        </Pressable>
        <Pressable onPress={props.onCancel} accessibilityRole="button" accessibilityLabel="Cancel" className="items-center justify-center mt-gap mb-row" style={TAP}>
          <Text className="text-accent text-sm font-semibold">Cancel</Text>
        </Pressable>
      </ActionsheetContent>
    </Actionsheet>
  );
}
