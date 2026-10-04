// From gluestack/gluestack-ui @ b712c85 (MIT), apps/starter-kit-expo-uniwind/components/ui/flat-list. Edits are marked // M9:.
'use client';
import React from 'react';
import { FlatList as RNFlatList, Platform, FlatListProps } from 'react-native';

// Performance-optimized FlatList with Android defaults
export function FlatList<ItemT = any>(props: FlatListProps<ItemT>) {
  // Apply Android-specific performance defaults if not explicitly overridden
  // M9 / the scroll audit (owner, 2026-10-04: "loading lags when I scroll"): upstream drew 5 rows
  // per 100 ms about 2 screens ahead and detached off-screen rows, so a fast swipe outran it (blank
  // rows filling in late) and rows flickered. Now 10 rows per 50 ms, about 5 screens either way,
  // nothing detached. iOS keeps React Native's own defaults (10 / 50 / 21).
  const optimizedProps = Platform.OS === 'android' ? {
    maxToRenderPerBatch: 10,
    updateCellsBatchingPeriod: 50,
    initialNumToRender: 10,
    windowSize: 11,
    ...props,
  } : props;

  return <RNFlatList {...optimizedProps} />;
}

// Also export the original for advanced use cases
export { FlatList as RNFlatList } from 'react-native';
