// From gluestack/gluestack-ui @ b712c85 (MIT), apps/starter-kit-expo-uniwind/components/ui/button. Edits are marked // M9:.
// M9: gluestack's shadcn-style colour names are translated to the app's tokens (data-model §1).
'use client';
import { createButton } from '@gluestack-ui/core/button/creator';
import { UIIcon } from '@gluestack-ui/core/icon/creator';
import {
  tva,
  useStyleContext,
  withStyleContext,
  type VariantProps,
} from '@gluestack-ui/utils/nativewind-utils';
import { withUniwind } from 'uniwind';
import React from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
const SCOPE = 'BUTTON';
const Root = withStyleContext(Pressable, SCOPE);
const StyledUIIcon = withUniwind(UIIcon);
const UIButton = createButton({
  Root: Root,
  Text,
  Group: View,
  Spinner: ActivityIndicator,
  Icon: StyledUIIcon,
});
const buttonStyle = tva({
  base: 'rounded-md flex-row items-center justify-center data-[focus-visible=true]:web:outline-none data-[focus-visible=true]:web:ring-2 data-[disabled=true]:opacity-40 gap-2',
  // M9: upstream's `h-fit` removed — react-native has no fit-content, and a Button holds
  // words, so it must never get a fixed height (G5: the largest font still fits).
  variants: {
    variant: {
      default:
        'bg-primary data-[hover=true]:bg-primary/90 data-[active=true]:bg-primary/90',
      destructive:
        'bg-accent data-[hover=true]:bg-accent/90 data-[active=true]:bg-accent/90 focus-visible:ring-accent/20 dark:focus-visible:ring-accent/40 dark:bg-accent/60',
      outline:
        'border border-separator bg-background shadow-xs data-[hover=true]:bg-surface data-[active=true]:bg-surface dark:bg-separator/[0.045] dark:border-separator/90 dark:data-[hover=true]:bg-separator/[0.075] dark:data-[active=true]:bg-separator/[0.075]',
      secondary:
        'bg-surface text-text data-[hover=true]:bg-surface/80 data-[active=true]:bg-surface/80',
      ghost: 'data-[hover=true]:bg-surface data-[active=true]:bg-surface dark:data-[hover=true]:bg-surface/50 dark:data-[active=true]:bg-surface/50',
      link: 'text-accent underline-offset-4 data-[hover=true]:underline data-[active=true]:underline',
    },
    size: {
      default: 'px-4 py-2',
      sm: 'min-h-8 rounded-md px-3 text-xs',
      lg: 'min-h-10 rounded-md px-8',
      icon: 'min-h-9 min-w-9',
    },
  },
});
const buttonTextStyle = tva({
  base: 'web:select-none font-sans',
  parentVariants: {
    variant: {
      default: 'text-onPrimary',
      destructive: 'text-background',
      outline: 'text-text data-[hover=true]:text-text data-[active=true]:text-text',
      secondary: 'text-text',
      ghost: 'text-text ',
      link: 'text-accent data-[hover=true]:underline data-[active=true]:underline',
    },
    size: {
      default: 'text-sm',
      sm: 'text-xs',
      lg: 'text-sm',
      icon: 'text-sm',
    },
  },
});

const buttonSpinnerStyle = tva({
  base: '',
  parentVariants: {
    size: {
      default: 'h-4 w-4',
      sm: 'h-3 w-3',
      lg: 'h-5 w-5',
      icon: 'h-4 w-4',
    },
  },
});

const buttonIconStyle = tva({
  base: 'fill-none pointer-events-none shrink-0',
  parentVariants: {
    variant: {
      default: 'text-onPrimary',
      destructive: 'text-background',
      outline:
        'text-text data-[hover=true]:text-text data-[active=true]:text-text',
      secondary: 'text-text',
      ghost:
        'text-text data-[hover=true]:text-text data-[active=true]:text-text',
      link: 'text-accent',
    },
    size: {
      default: 'h-4 w-4',
      sm: 'h-3 w-3',
      lg: 'h-5 w-5',
      icon: 'h-4 w-4',
    },
  },
});
const buttonGroupStyle = tva({
  base: '',
  variants: {
    space: {
      'xs': 'gap-1',
      'sm': 'gap-2',
      'md': 'gap-3',
      'lg': 'gap-4',
      'xl': 'gap-5',
      '2xl': 'gap-6',
      '3xl': 'gap-7',
      '4xl': 'gap-8',
    },
    isAttached: {
      true: 'gap-0',
    },
    flexDirection: {
      'row': 'flex-row',
      'column': 'flex-col',
      'row-reverse': 'flex-row-reverse',
      'column-reverse': 'flex-col-reverse',
    },
  },
});
type IButtonProps = Omit<
  React.ComponentPropsWithoutRef<typeof UIButton>,
  'context'
> &
  VariantProps<typeof buttonStyle> & { className?: string };
const Button = React.forwardRef<
  React.ElementRef<typeof UIButton>,
  IButtonProps
>(({ className, variant = 'default', size = 'default', ...props }, ref) => {
  return (
    <UIButton
      ref={ref}
      {...props}
      className={buttonStyle({ variant, size, class: className })}
      context={{ variant, size }}
    />
  );
});
type IButtonTextProps = React.ComponentPropsWithoutRef<typeof UIButton.Text> &
  VariantProps<typeof buttonTextStyle> & { className?: string };
const ButtonText = React.forwardRef<
  React.ElementRef<typeof UIButton.Text>,
  IButtonTextProps
>(({ className, size, ...props }, ref) => {
  const { size: parentSize, variant: parentVariant } = useStyleContext(SCOPE);
  return (
    <UIButton.Text
      ref={ref}
      {...props}
      className={buttonTextStyle({
        parentVariants: {
          size: parentSize,
          variant: parentVariant,
        },
        size,
        class: className,
      })}
    />
  );
});
const ButtonSpinner = React.forwardRef<
  React.ElementRef<typeof UIButton.Spinner>,
  React.ComponentPropsWithoutRef<typeof UIButton.Spinner>
>(({ className, ...props }, ref) => {
  const { size: parentSize } = useStyleContext(SCOPE);
  return <UIButton.Spinner ref={ref} {...props} className={buttonSpinnerStyle({ parentVariants: { size: parentSize }, class: className })} />;
});
type IButtonIcon = React.ComponentPropsWithoutRef<typeof UIButton.Icon> &
  VariantProps<typeof buttonIconStyle> & {
    className?: string | undefined;
    as?: React.ElementType;
    height?: number;
    width?: number;
  };
const ButtonIcon = React.forwardRef<
  React.ElementRef<typeof UIButton.Icon>,
  IButtonIcon
>(({ className, size, ...props }, ref) => {
  const { size: parentSize, variant: parentVariant } = useStyleContext(SCOPE);
  if (typeof size === 'number') {
    return (
      <UIButton.Icon
        ref={ref}
        {...props}
        className={buttonIconStyle({ class: className })}
        size={size}
      />
    );
  } else if (
    (props.height !== undefined || props.width !== undefined) &&
    size === undefined
  ) {
    return (
      <UIButton.Icon
        ref={ref}
        {...props}
        className={buttonIconStyle({ class: className })}
      />
    );
  }
  return (
    <UIButton.Icon
      {...props}
      className={buttonIconStyle({
        parentVariants: {
          size: parentSize,
          variant: parentVariant,
        },
        size,
        class: className,
      })}
      ref={ref}
    />
  );
});
type IButtonGroupProps = React.ComponentPropsWithoutRef<typeof UIButton.Group> &
  VariantProps<typeof buttonGroupStyle>;
const ButtonGroup = React.forwardRef<
  React.ElementRef<typeof UIButton.Group>,
  IButtonGroupProps
>(
  (
    {
      className,
      space = 'md',
      isAttached = false,
      flexDirection = 'column',
      ...props
    },
    ref
  ) => {
    return (
      <UIButton.Group
        className={buttonGroupStyle({
          class: className,
          space,
          isAttached,
          flexDirection,
        })}
        {...props}
        ref={ref}
      />
    );
  }
);
Button.displayName = 'Button';
ButtonText.displayName = 'ButtonText';
ButtonSpinner.displayName = 'ButtonSpinner';
ButtonIcon.displayName = 'ButtonIcon';
ButtonGroup.displayName = 'ButtonGroup';
export { Button, ButtonGroup, ButtonIcon, ButtonSpinner, ButtonText };
