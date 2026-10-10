// From gluestack/gluestack-ui @ b712c85 (MIT), apps/starter-kit-expo-uniwind/components/ui/actionsheet. Edits are marked // M9:.
// M9: gluestack's shadcn-style colour names are translated to the app's tokens (data-model §1).
'use client';
import { H4 } from '@expo/html-elements';
import { createActionsheet } from '@gluestack-ui/core/actionsheet/creator';
import { UIIcon } from '@gluestack-ui/core/icon/creator';
import type { VariantProps } from '@gluestack-ui/utils/nativewind-utils';
import { tva } from '@gluestack-ui/utils/nativewind-utils';
import {
  AnimatePresence,
  createMotionAnimatedComponent,
  Motion,
  MotionComponentProps,
} from '@legendapp/motion';
import { withUniwind } from 'uniwind';
import { OverlayRoot } from '../above-modals';
import React from 'react';
import {
  FlatList,
  Pressable,
  PressableProps,
  ScrollView,
  SectionList,
  Text,
  View,
  ViewStyle,
  VirtualizedList,
} from 'react-native';

const ItemWrapper = React.forwardRef<
  React.ComponentRef<typeof Pressable>,
  PressableProps
>(function ItemWrapper({ ...props }, ref) {
  return <Pressable {...props} ref={ref} />;
});

type IMotionViewProps = React.ComponentProps<typeof View> &
  MotionComponentProps<typeof View, ViewStyle, unknown, unknown, unknown>;

const MotionView = Motion.View as React.ComponentType<IMotionViewProps>;

type IAnimatedPressableProps = React.ComponentProps<typeof Pressable> &
  MotionComponentProps<typeof Pressable, ViewStyle, unknown, unknown, unknown>;

const AnimatedPressable = createMotionAnimatedComponent(
  Pressable
) as React.ComponentType<IAnimatedPressableProps>;

const StyledUIIcon = withUniwind(UIIcon);

export const UIActionsheet = createActionsheet({
  // M16a: the root is lifted above native modals on iOS (bug 1 — see ../above-modals).
  Root: OverlayRoot,
  Content: MotionView,
  Item: ItemWrapper,
  ItemText: Text,
  DragIndicator: View,
  IndicatorWrapper: View,
  Backdrop: AnimatedPressable,
  ScrollView: ScrollView,
  VirtualizedList: VirtualizedList,
  FlatList: FlatList,
  SectionList: SectionList,
  SectionHeaderText: H4,
  Icon: StyledUIIcon,
  AnimatePresence: AnimatePresence,
});

const actionsheetStyle = tva({ base: 'w-full h-full web:pointer-events-none' });

// M17 (`QueueSheet-B`): the Editorial sheet.
// M24 US18: every B sheet is the paper colour (#fbf8f1) with 24 pt top corners, so its white
// cards and tiles stand out (they vanished into the white sheet). No top line: the paper sheet
// sits on the scrim.
const actionsheetContentStyle = tva({
  base: 'items-center rounded-t-sheet p-4 bg-background web:pointer-events-auto web:select-none max-h-[80vh] pb-safe',
});

/**
 * M24 US18: about 30 callers still pass the M17 look (`bg-surface rounded-t-row`, a few
 * `rounded-t-artwork-lg`). The class merger keeps a caller's class over the base, so those words
 * are dropped here and every sheet takes the paper colour and the 24 pt corners at once. Layout
 * classes (padding, height, alignment) pass through untouched.
 */
const OLD_SHEET_LOOK = /^(?:bg-(?:surface|background)|rounded-t-(?:row|artwork|artwork-lg)|rounded-(?:row|artwork|artwork-lg)|border-t|border-separator)$/;
export function sheetClass(className: string | undefined): string {
  return (className ?? '').split(/\s+/).filter((c) => c !== '' && !OLD_SHEET_LOOK.test(c)).join(' ');
}

const actionsheetItemStyle = tva({
  base: 'w-full flex-row items-center p-3 rounded-sm data-[disabled=true]:opacity-40 data-[disabled=true]:web:pointer-events-auto data-[disabled=true]:web:cursor-not-allowed data-[hover=true]:bg-surface data-[active=true]:bg-surface data-[focus=true]:bg-surface web:data-[focus-visible=true]:bg-surface gap-2',
});

const actionsheetItemTextStyle = tva({
  base: 'text-text font-normal text-sm',
  variants: {
    isTruncated: {
      true: '',
    },
    bold: {
      true: 'font-bold',
    },
    underline: {
      true: 'underline',
    },
    strikeThrough: {
      true: 'line-through',
    },
  },
});

// Owner, 2026-10-04: the handle on top of every sheet is grey and small (was white, 100 × 8).
// M24 US18: 40 × 5 and darker (rgba .22), as every B sheet draws it.
const actionsheetDragIndicatorStyle = tva({
  base: 'w-10 h-[5px] bg-handle rounded-full',
});

const actionsheetDragIndicatorWrapperStyle = tva({
  base: 'w-full py-1 items-center',
});

const actionsheetBackdropStyle = tva({
  base: 'absolute left-0 top-0 right-0 bottom-0 bg-scrim web:cursor-default web:pointer-events-auto',
});

const actionsheetScrollViewStyle = tva({
  base: 'w-full h-auto',
});

const actionsheetVirtualizedListStyle = tva({
  base: 'w-full h-auto',
});

const actionsheetFlatListStyle = tva({
  base: 'w-full h-auto',
});

const actionsheetSectionListStyle = tva({
  base: 'w-full h-auto',
});

const actionsheetSectionHeaderTextStyle = tva({
  base: 'leading-5 font-semibold my-0 text-muted p-3 uppercase text-xs',
  variants: {
    isTruncated: {
      true: '',
    },
    bold: {
      true: 'font-bold',
    },
    underline: {
      true: 'underline',
    },
    strikeThrough: {
      true: 'line-through',
    },
    sub: {
      true: 'text-xs',
    },
    italic: {
      true: 'italic',
    },
    highlight: {
      true: 'bg-primary',
    },
  },
});

const actionsheetIconStyle = tva({
  base: 'text-text fill-none h-4 w-4',
});

type IActionsheetProps = VariantProps<typeof actionsheetStyle> &
  React.ComponentPropsWithoutRef<typeof UIActionsheet>;

type IActionsheetContentProps = VariantProps<typeof actionsheetContentStyle> &
  React.ComponentPropsWithoutRef<typeof UIActionsheet.Content> & {
    className?: string;
  };

type IActionsheetItemProps = VariantProps<typeof actionsheetItemStyle> &
  React.ComponentPropsWithoutRef<typeof UIActionsheet.Item>;

type IActionsheetItemTextProps = VariantProps<typeof actionsheetItemTextStyle> &
  React.ComponentPropsWithoutRef<typeof UIActionsheet.ItemText>;

type IActionsheetDragIndicatorProps = VariantProps<
  typeof actionsheetDragIndicatorStyle
> &
  React.ComponentPropsWithoutRef<typeof UIActionsheet.DragIndicator>;

type IActionsheetDragIndicatorWrapperProps = VariantProps<
  typeof actionsheetDragIndicatorWrapperStyle
> &
  React.ComponentPropsWithoutRef<typeof UIActionsheet.DragIndicatorWrapper>;

type IActionsheetBackdropProps = VariantProps<typeof actionsheetBackdropStyle> &
  React.ComponentPropsWithoutRef<typeof UIActionsheet.Backdrop> & {
    className?: string;
  };

type IActionsheetScrollViewProps = VariantProps<
  typeof actionsheetScrollViewStyle
> &
  React.ComponentPropsWithoutRef<typeof UIActionsheet.ScrollView>;

type IActionsheetVirtualizedListProps = VariantProps<
  typeof actionsheetVirtualizedListStyle
> &
  React.ComponentPropsWithoutRef<typeof UIActionsheet.VirtualizedList>;

type IActionsheetFlatListProps = VariantProps<typeof actionsheetFlatListStyle> &
  React.ComponentPropsWithoutRef<typeof UIActionsheet.FlatList>;

type IActionsheetSectionListProps = VariantProps<
  typeof actionsheetSectionListStyle
> &
  React.ComponentPropsWithoutRef<typeof UIActionsheet.SectionList>;

type IActionsheetSectionHeaderTextProps = VariantProps<
  typeof actionsheetSectionHeaderTextStyle
> &
  React.ComponentPropsWithoutRef<typeof UIActionsheet.SectionHeaderText>;

type IActionsheetIconProps = VariantProps<typeof actionsheetIconStyle> &
  React.ComponentPropsWithoutRef<typeof UIActionsheet.Icon> & {
    className?: string;
    as?: React.ElementType;
    height?: number;
    width?: number;
  };

const Actionsheet = React.forwardRef<
  React.ComponentRef<typeof UIActionsheet>,
  IActionsheetProps
>(function Actionsheet({ className, ...props }, ref) {
  return (
    <UIActionsheet
      className={actionsheetStyle({
        class: className,
      })}
      ref={ref}
      {...props}
    />
  );
});

/**
 * M25 IJ: `still` — the sheet sits where layout puts it instead of sliding to a measured spot.
 * gluestack slides the content from y = screen height to (its box's height − its own height),
 * measured by two onLayouts that arrive apart; with a keyboard opening at the same time the
 * target moves while the slide runs, and the sheet could stay one screen down — keyboard and scrim
 * up, no sheet (ios-journey runs 37993589437, 37772224452: the comment box at y 1046 on an 844 pt
 * screen). `still` is gluestack's `_experimentalContent` path: no measured slide, nothing to race.
 * For full-height sheets with a focused box; short sheets keep the slide.
 */
const ActionsheetContent = React.forwardRef<
  React.ComponentRef<typeof UIActionsheet.Content>,
  IActionsheetContentProps & { still?: boolean }
>(function ActionsheetContent({ className, still, ...props }, ref) {
  const placed = still ? ({ _experimentalContent: true } as object) : undefined;
  return (
    <UIActionsheet.Content
      className={actionsheetContentStyle({
        class: sheetClass(className),
      })}
      ref={ref}
      {...placed}
      {...props}
    />
  );
});

const ActionsheetItem = React.forwardRef<
  React.ComponentRef<typeof UIActionsheet.Item>,
  IActionsheetItemProps
>(function ActionsheetItem({ className, ...props }, ref) {
  return (
    <UIActionsheet.Item
      className={actionsheetItemStyle({
        class: className,
      })}
      ref={ref}
      {...props}
    />
  );
});

const ActionsheetItemText = React.forwardRef<
  React.ComponentRef<typeof UIActionsheet.ItemText>,
  IActionsheetItemTextProps
>(function ActionsheetItemText(
  { isTruncated, bold, underline, strikeThrough, className, ...props },
  ref
) {
  return (
    <UIActionsheet.ItemText
      className={actionsheetItemTextStyle({
        class: className,
        isTruncated: Boolean(isTruncated),
        bold: Boolean(bold),
        underline: Boolean(underline),
        strikeThrough: Boolean(strikeThrough),
      })}
      ref={ref}
      {...props}
    />
  );
});

const ActionsheetDragIndicator = React.forwardRef<
  React.ComponentRef<typeof UIActionsheet.DragIndicator>,
  IActionsheetDragIndicatorProps
>(function ActionsheetDragIndicator({ className, ...props }, ref) {
  return (
    <UIActionsheet.DragIndicator
      className={actionsheetDragIndicatorStyle({
        class: className,
      })}
      ref={ref}
      {...props}
    />
  );
});

const ActionsheetDragIndicatorWrapper = React.forwardRef<
  React.ComponentRef<typeof UIActionsheet.DragIndicatorWrapper>,
  IActionsheetDragIndicatorWrapperProps
>(function ActionsheetDragIndicatorWrapper({ className, ...props }, ref) {
  return (
    <UIActionsheet.DragIndicatorWrapper
      className={actionsheetDragIndicatorWrapperStyle({
        class: className,
      })}
      ref={ref}
      {...props}
    />
  );
});

const ActionsheetBackdrop = React.forwardRef<
  React.ComponentRef<typeof UIActionsheet.Backdrop>,
  IActionsheetBackdropProps
>(function ActionsheetBackdrop({ className, ...props }, ref) {
  return (
    <UIActionsheet.Backdrop
      initial={{
        opacity: 0,
      }}
      animate={{
        opacity: 1,
      }}
      exit={{
        opacity: 0,
      }}
      transition={{
        type: 'timing',
        duration: 200,
      }}
      {...props}
      className={actionsheetBackdropStyle({
        class: className,
      })}
      ref={ref}
    />
  );
});

const ActionsheetScrollView = React.forwardRef<
  React.ComponentRef<typeof UIActionsheet.ScrollView>,
  IActionsheetScrollViewProps
>(function ActionsheetScrollView({ className, ...props }, ref) {
  return (
    <UIActionsheet.ScrollView
      className={actionsheetScrollViewStyle({
        class: className,
      })}
      ref={ref}
      {...props}
    />
  );
});

const ActionsheetVirtualizedList = React.forwardRef<
  React.ComponentRef<typeof UIActionsheet.VirtualizedList>,
  IActionsheetVirtualizedListProps
>(function ActionsheetVirtualizedList({ className, ...props }, ref) {
  return (
    <UIActionsheet.VirtualizedList
      className={actionsheetVirtualizedListStyle({
        class: className,
      })}
      ref={ref}
      {...props}
    />
  );
});

const ActionsheetFlatList = React.forwardRef<
  React.ComponentRef<typeof UIActionsheet.FlatList>,
  IActionsheetFlatListProps
>(function ActionsheetFlatList({ className, ...props }, ref) {
  return (
    <UIActionsheet.FlatList
      className={actionsheetFlatListStyle({
        class: className,
      })}
      ref={ref}
      {...props}
    />
  );
});

const ActionsheetSectionList = React.forwardRef<
  React.ComponentRef<typeof UIActionsheet.SectionList>,
  IActionsheetSectionListProps
>(function ActionsheetSectionList({ className, ...props }, ref) {
  return (
    <UIActionsheet.SectionList
      className={actionsheetSectionListStyle({
        class: className,
      })}
      ref={ref}
      {...props}
    />
  );
});

const ActionsheetSectionHeaderText = React.forwardRef<
  React.ComponentRef<typeof UIActionsheet.SectionHeaderText>,
  IActionsheetSectionHeaderTextProps
>(function ActionsheetSectionHeaderText(
  {
    className,
    isTruncated,
    bold,
    underline,
    strikeThrough,
    sub,
    italic,
    highlight,
    ...props
  },
  ref
) {
  return (
    <UIActionsheet.SectionHeaderText
      className={actionsheetSectionHeaderTextStyle({
        class: className,
        isTruncated: Boolean(isTruncated),
        bold: Boolean(bold),
        underline: Boolean(underline),
        strikeThrough: Boolean(strikeThrough),
        sub: Boolean(sub),
        italic: Boolean(italic),
        highlight: Boolean(highlight),
      })}
      ref={ref}
      {...props}
    />
  );
});

const ActionsheetIcon = React.forwardRef<
  React.ComponentRef<typeof UIActionsheet.Icon>,
  IActionsheetIconProps
>(function ActionsheetIcon({ className, height, width, ...props }, ref) {
  if (typeof height === 'number' || typeof width === 'number') {
    return (
      <UIActionsheet.Icon
        ref={ref}
        {...props}
        height={height}
        width={width}
        className={actionsheetIconStyle({ class: className })}
      />
    );
  }
  return (
    <UIActionsheet.Icon
      className={actionsheetIconStyle({ class: className })}
      ref={ref}
      {...props}
    />
  );
});

export {
  Actionsheet, ActionsheetBackdrop, ActionsheetContent, ActionsheetDragIndicator,
  ActionsheetDragIndicatorWrapper, ActionsheetFlatList, ActionsheetIcon, ActionsheetItem,
  ActionsheetItemText, ActionsheetScrollView, ActionsheetSectionHeaderText, ActionsheetSectionList, ActionsheetVirtualizedList
};
