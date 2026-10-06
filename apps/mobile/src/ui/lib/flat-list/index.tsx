// From gluestack/gluestack-ui @ b712c85 (MIT), apps/starter-kit-expo-uniwind/components/ui/flat-list. Edits are marked // M9:.
'use client';
import React from 'react';
import { FlatList as RNFlatList, Platform, FlatListProps } from 'react-native';

// Performance-optimized FlatList with Android defaults
// M21: the ref reaches the list (React 19 passes `ref` as a prop), so `useScrollToTop` can scroll it.
export function FlatList<ItemT = any>(props: FlatListProps<ItemT> & { ref?: React.Ref<RNFlatList<ItemT>> }) {
  // Apply Android-specific performance defaults if not explicitly overridden
  const optimizedProps = Platform.OS === 'android' ? {
    removeClippedSubviews: true,
    maxToRenderPerBatch: 5,
    updateCellsBatchingPeriod: 100,
    initialNumToRender: 5,
    windowSize: 5,
    ...props,
  } : props;

  return <RNFlatList {...optimizedProps} />;
}

// Also export the original for advanced use cases
export { FlatList as RNFlatList } from 'react-native';
