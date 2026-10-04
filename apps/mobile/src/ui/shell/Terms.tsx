// First-run page: you must agree to terms and privacy before using the app.
/**
 * The consent screen (owner, 2026-09-27): the whole page, not a half sheet. Drawn over the stack like the launch screen,
 * so no route — not even a link that opened the app — gets past it. One way out: Agree.
 * "Disagree" opens a second page (the owner's screenshot, 2026-09-27): "Exit app" or
 * "Agree and continue". Exit closes the app on Android; iOS does not allow an app to
 * close itself, so there it goes back to the first page.
 *
 * A link opens the full document inside this same overlay (`LegalDoc`), not as a route:
 * a route would sit *under* the sheet. Android's back button closes an open document
 * and is otherwise swallowed.
 *
 * It sits above the root layout's SafeAreaView, so it needs its own — without one the
 * buttons ran under the home bar (owner, 2026-09-27).
 *
 * M17 (`Terms-B`, `TermsRefused-B`): the page is the warm page colour with a 48 pt icon, a 32 pt
 * serif title, and each document a white card (14 pt points in muted, 8 pt apart); the Agree bar
 * sits on the page colour above a hairline. After Disagree the page stays behind a scrim and the
 * second page is a centred white card — icon, serif title, the words, then "Agree and continue"
 * as the yellow pill and "Exit app" as a text button under it (it was a bottom sheet with the
 * two side by side). The page behind is hidden from screen readers and touch while the card is up.
 */
import { useEffect, useRef, useState } from "react";
import { BackHandler, Platform } from "react-native";
import { Image } from "@/ui/lib/image";
import { Pressable } from "@/ui/lib/pressable";
import { SafeAreaView } from "@/ui/lib/safe-area-view";
/** Drawn over the stack, outside the root layout's bottom inset — so this pads all four edges (M12). */
const ALL_EDGES = ["top", "bottom", "left", "right"] as const;
import { ScrollView } from "@/ui/lib/scroll-view";
import { Text } from "@/ui/lib/text";
import { Box } from "@/ui/lib/box";
import { LEGAL_TEXT } from "@/legal/texts";
import { Button, ButtonText } from "@/ui/lib/button";
import { EDGE, LegalDoc } from "./LegalDoc";
import { BottomBar } from "@/ui/kit/BottomBar";
import { Icon, type IconName } from "@/ui/kit/Icon";
import { useColours } from "@/ui/kit/useColours";
import { colour, hit, type Palette } from "@/design";
import { display } from "@/ui/auth/display";
import type { SettingsStore } from "@/storage/types";
import {
  CONSENT_INTRO,
  CONSENT_ITEMS,
  CONSENT_OUTRO,
  CONSENT_TITLE,
  REFUSE_TEXT,
  type LegalDocId,
} from "./consent";

/** The app icon on top: 48 pt (`Terms-B`; was 64). */
const ICON = { width: 60, height: 60 };

/** Apple's and Android's minimum tap size, as a style (shared-ui asserts it). */
const TAP = { minHeight: hit.min };
/** Disagree is one line of text (~20 pt); 14 pt above and below makes its tap area 48 pt. */
const DISAGREE_SLOP = { top: 14, bottom: 14, left: 24, right: 24 };
/** A card's head: 52 pt (`Terms-B`). */
const HEAD = { minHeight: 52 };
/**
 * Words on the brand-yellow fill are dark (owner, 2026-10-03) — AuthShell's `inkOn`, not
 * imported: AuthShell reads the providers, and the providers draw this page.
 */
const inkOn = (c: Palette): string =>
  c.primary === colour.primary ? colour.text : c.onPrimary;

/** Agree and "Agree and continue": 52 pt tall (`Terms-B`), as the consent sheet's Agree. */
const TALL = { minHeight: 52 };

/**
 * M9: the choices are gluestack Buttons. M17: yes is the yellow pill, no a bold accent text
 * button under it (`Terms-B`) — `outline` now means that text button. The words are the name.
 */
function Choice(props: {
  label: string;
  onPress: () => void;
  outline?: boolean;
  className: string;
  colours: Palette;
}): React.ReactElement {
  return (
    <Button
      variant={props.outline ? "link" : "default"}
      onPress={props.onPress}
      accessibilityRole="button"
      accessibilityLabel={props.label}
      className={`rounded-pill px-section ${props.outline ? "bg-transparent" : ""} ${props.className}`}
      style={props.outline ? TAP : TALL}
    >
      <ButtonText
        className={
          props.outline
            ? "text-body font-bold text-accent"
            : "text-[15px] font-bold text-onPrimary"
        }
        style={props.outline ? undefined : { color: inkOn(props.colours) }}
      >
        {props.label}
      </ButtonText>
    </Button>
  );
}

/** Each document's icon on its card. */
const DOC_ICON: Record<LegalDocId, IconName> = {
  agreement: "document-text-outline",
  privacy: "shield-checkmark-outline",
  community: "people-outline",
};

/** "Read the full agreement" — the link's last word, by document. */
const FULL: Record<LegalDocId, string> = {
  agreement: "agreement",
  privacy: "policy",
  community: "guidelines",
};

/** Tests render the page without the stores; the theme then follows the system. */
const NO_SETTINGS: Pick<SettingsStore, "get"> = { get: () => undefined };

/**
 * One document as a card (owner's reference, 2026-10-03): its icon, name and point count; a
 * tap on the head opens or closes its points; "Read the full …" opens the whole document.
 */
function Card(props: {
  item: (typeof CONSENT_ITEMS)[number];
  colours: Palette;
  expanded: boolean;
  onToggle: () => void;
  onOpen: () => void;
}): React.ReactElement {
  const { item, colours: c } = props;
  return (
    <Box className="rounded-row border border-border bg-surface px-section">
      <Pressable
        onPress={props.onToggle}
        accessibilityRole="button"
        accessibilityLabel={`${item.link}, ${item.points.length} points`}
        accessibilityState={{ expanded: props.expanded }}
        className="flex-row items-center gap-row py-1"
        style={HEAD}
      >
        <Icon name={DOC_ICON[item.doc]} size={20} color={c.accent} />
        <Box className="flex-1">
          <Text className="text-text text-[15px] font-bold">{item.link}</Text>
          <Text className="text-muted text-xs font-medium">
            {item.points.length} points
          </Text>
        </Box>
        <Icon
          name={props.expanded ? "chevron-up" : "chevron-down"}
          size={18}
          color={c.muted}
        />
      </Pressable>
      {props.expanded ? (
        <Box className="pt-1 pb-1">
          {/* Owner, 2026-10-03: numbered 01, 02 … instead of bullet dots. */}
          {item.points.map((p, i) => (
            <Box key={p} className="flex-row mb-gap">
              <Text className="text-accent text-body font-bold leading-[20px] min-w-7 pr-2">
                {String(i + 1).padStart(2, "0")}
              </Text>
              <Text className="text-muted text-body leading-[20px] flex-1">
                {p}
              </Text>
            </Box>
          ))}
          <Pressable
            onPress={props.onOpen}
            accessibilityRole="link"
            accessibilityLabel={`${item.link}, opens the full text`}
            className="justify-center self-start"
            style={TAP}
          >
            {/* Owner, 2026-10-03: the same colour as the card's icon (`Terms-B`) — read from the same palette value. */}
            <Text
              className="text-accent text-body font-bold underline"
              style={{ color: c.accent }}
            >{`Read the full ${FULL[item.doc]}`}</Text>
          </Pressable>
        </Box>
      ) : null}
    </Box>
  );
}

/** Android can close itself; iOS cannot (and must not), so there Exit returns to page one. */
const exitApp = (back: () => void): void => {
  if (Platform.OS === "android") BackHandler.exitApp();
  else back();
};

export function Terms(props: {
  onAccept: () => void;
  exit?: (back: () => void) => void;
  settings?: Pick<SettingsStore, "get">;
}): React.ReactElement {
  const c = useColours(props.settings ?? NO_SETTINGS);
  const [open, setOpen] = useState<LegalDocId | undefined>(undefined);
  // The first document is open when the page appears (owner's reference, 2026-10-03).
  const [expanded, setExpanded] = useState<LegalDocId | undefined>(
    CONSENT_ITEMS[0]?.doc,
  );
  const [refused, setRefused] = useState(false);
  const openRef = useRef(open);
  openRef.current = open;
  const refusedRef = useRef(refused);
  refusedRef.current = refused;

  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (openRef.current !== undefined) setOpen(undefined);
      else if (refusedRef.current) setRefused(false);
      return true;
    });
    return () => sub.remove();
  }, []);

  if (open !== undefined)
    return (
      <LegalDoc text={LEGAL_TEXT[open]} onClose={() => setOpen(undefined)} />
    );

  const page = (
    <SafeAreaView edges={ALL_EDGES} className="absolute inset-0 bg-background">
      {/* Full width, so the scroll bar sits on the screen's edge with no gap (owner, 2026-09-29);
          the side margin is on the content instead. Same as LegalDoc. */}
      <ScrollView
        className="flex-1"
        contentContainerClassName="px-screen-x pt-section pb-section"
        automaticallyAdjustsScrollIndicatorInsets={false}
        scrollIndicatorInsets={EDGE}
      >
        <Image
          source={require("../../../assets/app-icon.png")}
          style={ICON}
          className="rounded-row"
          accessibilityIgnoresInvertColors
        />
        <Text
          style={display(36, c.text, { leading: 44 })}
          className="text-text font-display mt-[14px] mb-gap"
          accessibilityRole="header"
        >
          {CONSENT_TITLE}
        </Text>
        <Text className="text-muted text-body leading-[21px] mb-section">
          {CONSENT_INTRO}
        </Text>
        <Box className="gap-gap">
          {CONSENT_ITEMS.map((item) => (
            <Card
              key={item.doc}
              item={item}
              colours={c}
              expanded={expanded === item.doc}
              onToggle={() =>
                setExpanded(expanded === item.doc ? undefined : item.doc)
              }
              onOpen={() => setOpen(item.doc)}
            />
          ))}
        </Box>
        <Text className="text-muted text-meta mt-gap">{CONSENT_OUTRO}</Text>
      </ScrollView>
      {/* Owner, 2026-10-04: the two choices sit in the middle of the bar — the same space above
          Agree as below Disagree. Disagree keeps its 48 pt tap area through hitSlop, not height. */}
      <BottomBar tone="page" pad="row">
        <Choice
          colours={c}
          label="Agree"
          onPress={props.onAccept}
          className="w-full"
        />
        <Pressable
          onPress={() => setRefused(true)}
          accessibilityRole="button"
          accessibilityLabel="Disagree"
          className="items-center justify-center mt-row"
          hitSlop={DISAGREE_SLOP}
        >
          <Text className="text-accent text-body font-bold">Disagree</Text>
        </Pressable>
      </BottomBar>
    </SafeAreaView>
  );

  if (!refused) return page;

  // `TermsRefused-B`: the page stays drawn behind a scrim, out of reach of touch and screen
  // readers; the second page is a centred card over it.
  return (
    <Box className="absolute inset-0">
      <Box
        className="absolute inset-0"
        pointerEvents="none"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        {page}
      </Box>
      <Box className="absolute inset-0 bg-scrim justify-center px-6">
        <Box
          className="bg-surface rounded-artwork-lg p-6 items-stretch"
          accessibilityViewIsModal
        >
          <Image
            source={require("../../../assets/app-icon.png")}
            style={ICON}
            className="rounded-row self-center"
            accessibilityIgnoresInvertColors
          />
          <Text
            style={display(28, c.text, { leading: 28 })}
            className="text-text font-display text-center mt-[14px]"
            accessibilityRole="header"
          >
            {CONSENT_TITLE}
          </Text>
          <Text className="text-muted text-[16px] leading-[23px] text-center mt-row">
            {REFUSE_TEXT}
          </Text>
          <Choice
            colours={c}
            label="Agree and continue"
            onPress={props.onAccept}
            className="w-full mt-screen-x"
          />
          <Choice
            colours={c}
            label="Exit app"
            outline
            onPress={() => (props.exit ?? exitApp)(() => setRefused(false))}
            className="w-full mt-1"
          />
        </Box>
      </Box>
    </Box>
  );
}
