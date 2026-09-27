/**
 * The consent checkbox under the sign-in form and the dialog that asks when it is not
 * ticked (owner's reference screenshots, 2026-09-27). The links open the full documents
 * in an overlay, as the Terms screen does. M9: the dialog is gluestack's AlertDialog and the
 * document overlay is gluestack's Modal at full size.
 */
import { useState } from 'react';
import { Pressable } from '../lib/pressable';
import { Modal, ModalBackdrop, ModalContent } from '../lib/modal';
import { AlertDialog, AlertDialogBackdrop, AlertDialogBody, AlertDialogContent, AlertDialogFooter, AlertDialogHeader } from '../lib/alert-dialog';
import { Heading } from '../lib/heading';
import { Text } from '../lib/text';
import { Box } from '../lib/box';
import { hit } from '../../design';
import { LEGAL_TEXT } from '../../legal/texts';
import { LegalDoc } from '../LegalDoc';

type Doc = 'agreement' | 'privacy';
const TAP = { minHeight: hit.min };
const BOX = { width: 22, height: 22 };

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
 * Owner, 2026-09-27: the old dialog read as cramped — tight lines and two bare words at
 * the bottom. Now: centred title, the sentence on 24 px lines, and two real buttons.
 */
export function ConsentDialog(props: { visible: boolean; action: string; onCancel: () => void; onAgree: () => void; open: (d: Doc) => void }): React.ReactElement {
  return (
    <AlertDialog isOpen={props.visible} onClose={props.onCancel}>
      <AlertDialogBackdrop />
      <AlertDialogContent className="bg-background rounded-artwork px-section pt-section pb-section w-[90%] border-0" accessibilityViewIsModal>
        <AlertDialogHeader className="justify-center">
          <Heading className="text-text text-base font-bold text-center" accessibilityRole="header">Before you continue</Heading>
        </AlertDialogHeader>
        <AlertDialogBody>
          <Text className="text-muted text-sm leading-[24px] text-center mt-row">
            Please read and agree to the <Links open={props.open} />.
          </Text>
        </AlertDialogBody>
        <AlertDialogFooter className="flex-row gap-row mt-section">
            <Pressable onPress={props.onCancel} accessibilityRole="button" accessibilityLabel="Cancel" className="flex-1 items-center justify-center rounded-pill border border-separator" style={TAP}>
              <Text className="text-text text-sm font-semibold">Cancel</Text>
            </Pressable>
            <Pressable onPress={props.onAgree} accessibilityRole="button" accessibilityLabel={`Agree and ${props.action}`} className="flex-1 items-center justify-center rounded-pill bg-primary" style={TAP}>
              <Text className="text-onPrimary text-sm font-semibold">Agree</Text>
            </Pressable>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
