// The "I agree" tick box under sign-in, and the sheet that asks if it is not ticked.
/**
 * The consent checkbox under the sign-in form and the sheet that asks when it is not ticked (owner's reference screenshots,
 * 2026-09-27). The links open the full documents in an overlay, as the Terms screen does.
 *
 * M31 S-C (T061; design-pulse2 `settings.html` `signInPage`, `consentSheet`, entries `auth-sign-in--consent-sheet`,
 * `auth-sign-in--legal-document`): the row is the 22 tick box (hot fill with a void tick; unticked a 1.5 rim) and the sentence in
 * Geist 13 on 19 in text-2, 10 away, its two names hot-text 600 links. The ask is the kit `ActionSheet`: "Before you continue"
 * in Unbounded 800 28, the line in 15, the two documents as 56 rows in one void group tile (icon, name, chevron), then Agree
 * (light, 52) and Cancel (quiet, 48). The document is the full-screen `LegalDoc` over everything, its Back in the bottom bar.
 * Same actions, same spoken names ("Agree and continue", "Cancel", the two document rows).
 */
import { useState } from 'react';
import { Modal, ModalBackdrop, ModalContent } from '@/ui/lib/modal';
import { Pressable } from '@/ui/lib/pressable';
import { Box } from '@/ui/lib/box';
import { Text } from '@/ui/kit/Text';
import { LEGAL_TEXT } from '@/legal/texts';
import { LegalDoc } from '@/ui/shell/LegalDoc';
import { ActionSheet } from '@/ui/kit/ActionSheet';
import { PanelRow } from '@/ui/kit/PanelRow';
import { PulseButton } from '@/ui/kit/PulseButton';
import { Type } from '@/ui/kit/Type';
import { PanelGroup } from '@/ui/me/Panel';
import { AUTH, AUTH_TYPE } from './measures';
import { TICK_SLOP, TickBox } from './parts';

type Doc = 'agreement' | 'privacy';
/** The short name each document wears on its bar. */
export const DOC_NAME: Record<Doc, string> = { agreement: 'Service Agreement', privacy: 'Privacy Policy' };
/** The sheet slides out over `motion.move`; the document waits that long and a breath. */
export const READ_DELAY = 320;

function Links(props: { open: (d: Doc) => void }): React.ReactElement {
  return (
    <>
      <Text className="text-hotText font-semibold" onPress={() => props.open('agreement')} accessibilityRole="link">Service Agreement</Text>
      <Text className="text-text2"> and </Text>
      <Text className="text-hotText font-semibold" onPress={() => props.open('privacy')} accessibilityRole="link">Privacy Policy</Text>
    </>
  );
}

export function useLegalOverlay(): { open: (d: Doc) => void; overlay: React.ReactElement | null } {
  const [doc, setDoc] = useState<Doc | undefined>(undefined);
  return {
    open: setDoc,
    overlay:
      doc === undefined ? null : (
        <Modal isOpen size="full" onClose={() => setDoc(undefined)}>
          <ModalBackdrop />
          <ModalContent className="w-full h-full rounded-none border-0 bg-void" style={{ padding: 0 }}>
            <LegalDoc text={LEGAL_TEXT[doc]} name={DOC_NAME[doc]} onClose={() => setDoc(undefined)} />
          </ModalContent>
        </Modal>
      ),
  };
}

/** The tick box and the sentence, aligned at the top (a sentence of two lines keeps the box beside its first). */
export function ConsentRow(props: { agreed: boolean; onToggle: () => void; open: (d: Doc) => void }): React.ReactElement {
  return (
    <Box className="flex-row items-start" style={{ gap: AUTH.box.gap }}>
      <Pressable onPress={props.onToggle} accessibilityRole="checkbox" accessibilityState={{ checked: props.agreed }} accessibilityLabel="I have read and agree to the Service Agreement and Privacy Policy" hitSlop={TICK_SLOP}>
        <TickBox on={props.agreed} />
      </Pressable>
      <Text className="text-text2 font-normal flex-1" style={AUTH_TYPE.consent}>
        I have read and agree to the <Links open={props.open} />
      </Text>
    </Box>
  );
}

/**
 * The ask before signing in, when the box is not ticked: the kit sheet. The Agree button keeps its "Agree and <action>" spoken
 * name; the backdrop, the grabber's drag and Cancel close it.
 */
export function ConsentDialog(props: { visible: boolean; action: string; onCancel: () => void; onAgree: () => void; open: (d: Doc) => void }): React.ReactElement {
  // design-pulse2 `auth-sign-in--legal-document`: Back returns to the sign-in page, not to the sheet. Two native modals cannot be
  // up at once on iOS, so the sheet closes first and the document opens once it has gone.
  const read = (d: Doc): void => { props.onCancel(); setTimeout(() => props.open(d), READ_DELAY); };
  return (
    <ActionSheet open={props.visible} onClose={props.onCancel} label="Before you continue">
      <Type step="hero" className="text-text" style={AUTH_TYPE.sheetTitle} accessibilityRole="header">Before you continue</Type>
      <Type step="body" className="text-text2 font-medium" style={AUTH_TYPE.sheetLine}>Please read and agree to these two documents.</Type>
      <PanelGroup tone="void">
        <PanelRow icon="document-text-outline" label="Service Agreement" onPress={() => read('agreement')} />
        <PanelRow icon="lock-closed-outline" label="Privacy Policy" onPress={() => read('privacy')} />
      </PanelGroup>
      <PulseButton label="Agree" accessibilityLabel={`Agree and ${props.action}`} kind="light" height={AUTH.foot.button} full onPress={props.onAgree} />
      <PulseButton label="Cancel" kind="quiet" full onPress={props.onCancel} />
    </ActionSheet>
  );
}
