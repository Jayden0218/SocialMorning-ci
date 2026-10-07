// From gluestack/gluestack-ui @ b712c85 (MIT), apps/starter-kit-expo-uniwind/components/ui/toast. Edits are marked // M9:.
// M9: gluestack's shadcn-style colour names are translated to the app's tokens (data-model §1).
'use client';
import { createToastHook } from '@gluestack-ui/core/toast/creator';
import type { VariantProps } from '@gluestack-ui/utils/nativewind-utils';
import { tva, useStyleContext, withStyleContext } from '@gluestack-ui/utils/nativewind-utils';
import { withUniwind } from 'uniwind';
import React from 'react';
import { AccessibilityInfo, Text, View } from 'react-native';
import Animated, { SlideInUp } from 'react-native-reanimated';
const useToast = createToastHook(View);
const SCOPE = 'TOAST';
const AnimatedView = Animated.createAnimatedComponent(View);
const StyledAnimatedView = withUniwind(AnimatedView);
const toastStyle = tva({
  base: 'p-4 m-1 rounded-md gap-1 web:pointer-events-auto border-separator',
  variants: {
    action: {
      error: 'bg-background text-text',
      warning: 'bg-background text-text',
      success: 'bg-background text-text',
      info: 'bg-background text-text',
      muted: 'bg-background text-text',
    },

    variant: {
      solid: 'border border-separator bg-background shadow-soft-4',
      outline: 'border border-separator bg-background',
    },
  },
});

const toastTitleStyle = tva({
  base: 'font-medium font-body tracking-md text-left',
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
    size: {
      '2xs': 'text-2xs',
      'xs': 'text-xs',
      'sm': 'text-sm',
      'md': 'text-base',
      'lg': 'text-lg',
      'xl': 'text-xl',
      '2xl': 'text-2xl',
      '3xl': 'text-3xl',
      '4xl': 'text-4xl',
      '5xl': 'text-5xl',
      '6xl': 'text-6xl',
    },
  },
  parentVariants: {
    variant: {
      solid: '',
      outline: 'text-text',
    },
    action: {
      error: '',
      warning: '',
      success: '',
      info: '',
      muted: '',
    },
  },
  parentCompoundVariants: [
    {
      variant: 'solid',
      action: 'error',
      class: 'text-background',
    },
    {
      variant: 'solid',
      action: 'warning',
      class: 'text-text',
    },
    {
      variant: 'solid',
      action: 'success',
      class: 'text-text',
    },
    {
      variant: 'solid',
      action: 'info',
      class: 'text-text',
    },
    {
      variant: 'solid',
      action: 'muted',
      class: 'text-muted',
    },
    {
      variant: 'outline',
      action: 'error',
      class: 'text-accent',
    },
    {
      variant: 'outline',
      action: 'warning',
      class: 'text-text',
    },
    {
      variant: 'outline',
      action: 'success',
      class: 'text-text',
    },
    {
      variant: 'outline',
      action: 'info',
      class: 'text-text',
    },
    {
      variant: 'outline',
      action: 'muted',
      class: 'text-muted',
    },
  ],
});

const toastDescriptionStyle = tva({
  base: 'font-normal font-body tracking-md text-left',
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
    size: {
      '2xs': 'text-2xs',
      'xs': 'text-xs',
      'sm': 'text-sm',
      'md': 'text-base',
      'lg': 'text-lg',
      'xl': 'text-xl',
      '2xl': 'text-2xl',
      '3xl': 'text-3xl',
      '4xl': 'text-4xl',
      '5xl': 'text-5xl',
      '6xl': 'text-6xl',
    },
  },
  parentVariants: {
    variant: {
      solid: 'text-muted',
      outline: 'text-muted',
    },
  },
});

const Root = withStyleContext(StyledAnimatedView, SCOPE);
type IToastProps = React.ComponentProps<typeof Root> & {
  className?: string;
} & VariantProps<typeof toastStyle>;

const Toast = React.forwardRef<React.ComponentRef<typeof Root>, IToastProps>(
  function Toast(
    { className, variant = 'solid', action = 'muted', ...props },
    ref
  ) {
    return (
      <Root
        ref={ref}
        entering={SlideInUp}
        className={toastStyle({ variant, action, class: className })}
        context={{ variant, action }}
        {...props}
      />
    );
  }
);

type IToastTitleProps = React.ComponentProps<typeof Text> & {
  className?: string;
} & VariantProps<typeof toastTitleStyle>;

const ToastTitle = React.forwardRef<
  React.ComponentRef<typeof Text>,
  IToastTitleProps
>(function ToastTitle({ className, size = 'md', children, ...props }, ref) {
  const { variant: parentVariant, action: parentAction } =
    useStyleContext(SCOPE);
  React.useEffect(() => {
    // Issue from react-native side
    // Hack for now, will fix this later
    AccessibilityInfo.announceForAccessibility(children as string);
  }, [children]);

  return (
    <Text
      {...props}
      ref={ref}
      aria-live="assertive"
      aria-atomic="true"
      role="alert"
      className={toastTitleStyle({
        size,
        class: className,
        parentVariants: {
          variant: parentVariant,
          action: parentAction,
        },
      })}
    >
      {children}
    </Text>
  );
});

type IToastDescriptionProps = React.ComponentProps<typeof Text> & {
  className?: string;
} & VariantProps<typeof toastDescriptionStyle>;

const ToastDescription = React.forwardRef<
  React.ComponentRef<typeof Text>,
  IToastDescriptionProps
>(function ToastDescription({ className, size = 'md', ...props }, ref) {
  const { variant: parentVariant } = useStyleContext(SCOPE);
  return (
    <Text
      ref={ref}
      {...props}
      className={toastDescriptionStyle({
        size,
        class: className,
        parentVariants: {
          variant: parentVariant,
        },
      })}
    />
  );
});

Toast.displayName = 'Toast';
ToastTitle.displayName = 'ToastTitle';
ToastDescription.displayName = 'ToastDescription';

export { Toast, ToastDescription, ToastTitle, useToast };

