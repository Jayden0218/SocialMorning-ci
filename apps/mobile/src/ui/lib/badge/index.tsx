// From gluestack/gluestack-ui @ b712c85 (MIT), apps/starter-kit-expo-uniwind/components/ui/badge. Edits are marked // M9:.
// M9: gluestack's shadcn-style colour names are translated to the app's tokens (data-model §1).
'use client';
import { PrimitiveIcon, UIIcon } from '@gluestack-ui/core/icon/creator';
import type { VariantProps } from '@gluestack-ui/utils/nativewind-utils';
import { tva, useStyleContext, withStyleContext } from '@gluestack-ui/utils/nativewind-utils';
import { withUniwind } from 'uniwind';
import React from 'react';
import { Text, View } from 'react-native';
import { Svg } from 'react-native-svg';

const SCOPE = 'BADGE';

const badgeStyle = tva({
  base: 'flex-row items-center justify-center rounded-sm px-2 py-0.5',
  variants: {
    variant: {
      default: 'bg-primary',
      secondary: 'bg-surface',
      destructive:
        'bg-accent',
      outline: 'border border-separator bg-transparent',
    },
  },
});

const badgeTextStyle = tva({
  base: 'text-xs font-medium tracking-normal uppercase',
  parentVariants: {
    variant: {
      default: 'text-onPrimary',
      secondary: 'text-text',
      destructive: 'text-background',
      outline: 'text-text',
    },
  },
});

const badgeIconStyle = tva({
  base: 'fill-none h-3 w-3 pointer-events-none',
  parentVariants: {
    variant: {
      default: 'text-onPrimary',
      secondary: 'text-text',
      destructive: 'text-background',
      outline: 'text-text',
    },
  },
});

const ContextView = withStyleContext(View, SCOPE);

type IBadgeProps = React.ComponentPropsWithoutRef<typeof ContextView> &
  VariantProps<typeof badgeStyle>;
function Badge({
  children,
  variant = 'default',
  className,
  ...props
}: { className?: string } & IBadgeProps) {
  return (
    <ContextView
      className={badgeStyle({ variant, class: className })}
      {...props}
      context={{ variant }}
    >
      {children}
    </ContextView>
  );
}

type IBadgeTextProps = React.ComponentPropsWithoutRef<typeof Text> &
  VariantProps<typeof badgeTextStyle>;

const BadgeText = React.forwardRef<
  React.ComponentRef<typeof Text>,
  IBadgeTextProps
>(function BadgeText({ children, className, ...props }, ref) {
  const { variant: parentVariant } = useStyleContext(SCOPE);
  return (
    <Text
      ref={ref}
      className={badgeTextStyle({
        parentVariants: {
          variant: parentVariant,
        },
        class: className,
      })}
      {...props}
    >
      {children}
    </Text>
  );
});

type IBadgeIconProps = React.ComponentPropsWithoutRef<typeof PrimitiveIcon> &
  VariantProps<typeof badgeIconStyle> & {
    size?: number;
};
  
const StyledUIIcon = withUniwind(UIIcon);


const BadgeIcon = React.forwardRef<
  React.ComponentRef<typeof Svg>,
  IBadgeIconProps
>(function BadgeIcon({ className, size, ...props }, ref) {
  const { variant: parentVariant } = useStyleContext(SCOPE);

  if (typeof size === 'number') {
    return (
      <StyledUIIcon
        ref={ref}
        {...props}
        className={badgeIconStyle({ class: className })}
        size={size}
      />
    );
  } else if (
    (props?.height !== undefined || props?.width !== undefined) &&
    size === undefined
  ) {
    return (
      <StyledUIIcon
        ref={ref}
        {...props}
        className={badgeIconStyle({ class: className })}
      />
    );
  }
  return (
    <StyledUIIcon
      className={badgeIconStyle({
        parentVariants: {
          variant: parentVariant,
        },
        class: className,
      })}
      {...props}
      ref={ref}
    />
  );
});

Badge.displayName = 'Badge';
BadgeText.displayName = 'BadgeText';
BadgeIcon.displayName = 'BadgeIcon';

export { Badge, BadgeIcon, BadgeText };
