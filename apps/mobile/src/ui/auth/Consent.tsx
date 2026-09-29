/**
 * The consent checkbox under the sign-in form and the dialog that asks when it is not
 * ticked (owner's reference screenshots, 2026-09-27). The links open the full documents
 * in an overlay, as the Terms screen does.
 */
import { useState } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import { hit } from '../../design';
import { LEGAL_TEXT } from '../../legal/texts';
import { LegalDoc } from '../LegalDoc';

type Doc = 'agreement' | 'privacy';
const TAP = { minHeight: hit.min };
const BOX = { width: 22, height: 22 };
/** A dialog, not a banner: narrower than the screen, so it reads as a card (owner, 2026-09-29). */
const CARD = { width: '84%', maxWidth: 340 } as const;

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
      <Modal visible animationType="slide" onRequestClose={() => setDoc(undefined)}>
        <LegalDoc text={LEGAL_TEXT[doc]} onClose={() => setDoc(undefined)} />
      </Modal>
    ),
  };
}

export function ConsentRow(props: { agreed: boolean; onToggle: () => void; open: (d: Doc) => void }): React.ReactElement {
  return (
    <View className="flex-row items-center gap-row mt-section">
      <Pressable
        onPress={props.onToggle}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: props.agreed }}
        accessibilityLabel="I have read and agree to the Service Agreement and Privacy Policy"
        className="justify-center"
        style={TAP}
      >
        <View className={`rounded border-2 items-center justify-center ${props.agreed ? 'bg-primary border-primary' : 'border-muted'}`} style={BOX}>
          {props.agreed ? <Text className="text-onPrimary text-xs font-bold">✓</Text> : null}
        </View>
      </Pressable>
      <Text className="text-muted text-xs leading-[18px] flex-1">
        I have read and agree to the <Links open={props.open} />
      </Text>
    </View>
  );
}

/**
 * Owner, 2026-09-27: the old dialog read as cramped — tight lines and two bare words at
 * the bottom. Now: centred title, the sentence on 24 px lines, and two real buttons.
 * Owner, 2026-09-29: it was the full screen width and only ~150 pt tall — a strip, not a
 * dialog. Now a card at 84 % of the width (at most 340), 24 pt inside on every side,
 * and more room between the title, the sentence and the buttons.
 */
export function ConsentDialog(props: { visible: boolean; action: string; onCancel: () => void; onAgree: () => void; open: (d: Doc) => void }): React.ReactElement {
  return (
    <Modal visible={props.visible} transparent animationType="fade" onRequestClose={props.onCancel}>
      <View className="flex-1 bg-scrim items-center justify-center">
        <View className="bg-background rounded-artwork p-screen-x" style={CARD} accessibilityViewIsModal>
          <Text className="text-text text-base font-bold text-center" accessibilityRole="header">Before you continue</Text>
          <Text className="text-muted text-sm leading-[24px] text-center mt-row mb-screen-x">
            Please read and agree to the <Links open={props.open} />.
          </Text>
          <View className="flex-row gap-row">
            <Pressable onPress={props.onCancel} accessibilityRole="button" accessibilityLabel="Cancel" className="flex-1 items-center justify-center rounded-pill border border-separator" style={TAP}>
              <Text className="text-text text-sm font-semibold">Cancel</Text>
            </Pressable>
            <Pressable onPress={props.onAgree} accessibilityRole="button" accessibilityLabel={`Agree and ${props.action}`} className="flex-1 items-center justify-center rounded-pill bg-primary" style={TAP}>
              <Text className="text-onPrimary text-sm font-semibold">Agree</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}
