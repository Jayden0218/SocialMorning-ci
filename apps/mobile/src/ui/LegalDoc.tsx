/**
 * One legal document, full screen (owner, 2026-09-27). Opened from a link on the Terms
 * sheet and drawn inside the same overlay, so reading a document never gets anyone past
 * the sheet. Back — the button or Android's — returns to the sheet. Its own
 * SafeAreaView, for the same reason as the sheet's.
 */
import { useMemo } from 'react';
import { Pressable, SafeAreaView, ScrollView, Text, View } from 'react-native';
import { hit } from '../design';
import { parseLegal, titleOf, type Block, type BlockKind } from '../legal/markdown';

/**
 * Owner, 2026-09-27: plain weight for the body, looser lines (16 px type on 26 px lines),
 * and no bold inside a paragraph — `**…**` spans keep the darker `text` colour instead,
 * so the terms the documents say are "shown in bold" still stand apart from the grey body.
 */
const KIND: Record<BlockKind, string> = {
  title: 'text-text text-lg font-semibold',
  heading: 'text-text text-base font-semibold leading-[28px] mt-section',
  subheading: 'text-text text-sm font-semibold leading-[26px] mt-row',
  paragraph: 'text-muted text-sm leading-[26px]',
  item: 'text-muted text-sm leading-[26px] flex-1',
  note: 'text-muted text-xs leading-[20px] italic',
  row: 'text-muted text-xs leading-[20px]',
};

/** Kept as a style: the tap target is asserted on the Pressable's own `style` elsewhere. */
const TAP = { minHeight: hit.min, minWidth: hit.min };

function Spans(props: { block: Block }): React.ReactElement {
  return <>{props.block.spans.map((s, i) => (s.bold ? <Text key={i} className="text-text">{s.text}</Text> : s.text))}</>;
}

function BlockText(props: { block: Block }): React.ReactElement {
  const { block } = props;
  // A list item hangs: the bullet has its own column, so a wrapped line starts under
  // the words, never under the bullet.
  if (block.kind === 'item') {
    return (
      <View className="flex-row mb-row pl-2">
        <Text className="text-muted text-sm leading-[26px] w-5">•</Text>
        <Text className={KIND.item}><Spans block={block} /></Text>
      </View>
    );
  }
  return (
    <Text className={`${KIND[block.kind]} mb-row`} accessibilityRole={block.kind === 'heading' ? 'header' : undefined}>
      <Spans block={block} />
    </Text>
  );
}

/** A chevron drawn from two borders, so no icon font is added for one glyph. */
function Chevron(): React.ReactElement {
  return <View className="w-3 h-3 border-l-2 border-b-2 border-text rotate-45 ml-1" />;
}

export function LegalDoc(props: { text: string; onClose: () => void }): React.ReactElement {
  const title = useMemo(() => titleOf(props.text), [props.text]);
  // The title is drawn once, above the body; the body starts after it.
  const body = useMemo(() => parseLegal(props.text).filter((b) => b.kind !== 'title'), [props.text]);
  return (
    <SafeAreaView className="absolute inset-0 bg-background">
      {/* Owner, 2026-09-27: the bar holds only the chevron; the title sits below it. */}
      <View className="flex-row items-center pt-section px-2">
        <Pressable onPress={props.onClose} accessibilityRole="button" accessibilityLabel="Back" className="justify-center items-center" style={TAP}>
          <Chevron />
        </Pressable>
      </View>
      {/* The ScrollView spans the full width, so its scroll bar sits on the screen's edge;
          the side margin is on the inner View, so the bar never lies over the words. */}
      <ScrollView className="flex-1">
        <View className="px-screen-x pt-2 pb-section">
          <Text className="text-text text-lg font-bold leading-[32px] mb-section" accessibilityRole="header">{title}</Text>
          {body.map((b, i) => <BlockText key={i} block={b} />)}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
