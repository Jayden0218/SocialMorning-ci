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

const KIND: Record<BlockKind, string> = {
  title: 'text-text text-lg font-bold',
  heading: 'text-text text-base font-bold mt-section',
  subheading: 'text-text text-sm font-bold mt-row',
  paragraph: 'text-muted text-sm',
  item: 'text-muted text-sm pl-section',
  note: 'text-muted text-xs italic',
  row: 'text-muted text-xs',
};

/** Kept as a style: the tap target is asserted on the Pressable's own `style` elsewhere. */
const TAP = { minHeight: hit.min, minWidth: hit.min };

function BlockText(props: { block: Block }): React.ReactElement {
  const { block } = props;
  return (
    <Text className={`${KIND[block.kind]} mb-row`} accessibilityRole={block.kind === 'heading' ? 'header' : undefined}>
      {block.kind === 'item' ? '• ' : ''}
      {block.spans.map((s, i) => (s.bold ? <Text key={i} className="text-text font-bold">{s.text}</Text> : s.text))}
    </Text>
  );
}

export function LegalDoc(props: { text: string; onClose: () => void }): React.ReactElement {
  const title = useMemo(() => titleOf(props.text), [props.text]);
  // The title is in the bar; the body starts after it.
  const body = useMemo(() => parseLegal(props.text).filter((b) => b.kind !== 'title'), [props.text]);
  return (
    <SafeAreaView className="absolute inset-0 bg-background">
      <View className="flex-row items-center border-b-hairline border-separator px-row pt-section">
        <Pressable onPress={props.onClose} accessibilityRole="button" accessibilityLabel="Back" className="justify-center px-row" style={TAP}>
          <Text className="text-accent text-sm font-semibold">‹ Back</Text>
        </Pressable>
        <Text className="text-text text-sm font-bold flex-1" numberOfLines={1} accessibilityRole="header">{title}</Text>
      </View>
      <ScrollView className="flex-1" contentContainerClassName="px-screen-x pt-section pb-section">
        <Text className="text-text text-lg font-bold mb-section">{title}</Text>
        {body.map((b, i) => <BlockText key={i} block={b} />)}
      </ScrollView>
    </SafeAreaView>
  );
}
