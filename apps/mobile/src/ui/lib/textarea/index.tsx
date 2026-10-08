// From gluestack/gluestack-ui @ b712c85 (MIT), apps/starter-kit-expo-uniwind/components/ui/textarea. Edits are marked // M9:.
// M9: gluestack's shadcn-style colour names are translated to the app's tokens (data-model §1).
'use client';
import React from 'react';
import { createTextarea } from '@gluestack-ui/core/textarea/creator';
import { View, TextInput } from 'react-native';
import { tva } from '@gluestack-ui/utils/nativewind-utils';
import {
  withStyleContext,
  useStyleContext,
} from '@gluestack-ui/utils/nativewind-utils';
import type { VariantProps } from '@gluestack-ui/utils/nativewind-utils';
import { useFace } from '../text';

const SCOPE = 'TEXTAREA';
const UITextarea = createTextarea({
  Root: withStyleContext(View, SCOPE),
  Input: TextInput,
});

const textareaStyle = tva({
  base: 'w-full h-[100px] border border-separator rounded data-[hover=true]:border-separator/80 data-[focus=true]:border-primary/80 data-[focus=true]:data-[hover=true]:border-primary/80 data-[disabled=true]:opacity-40 data-[disabled=true]:bg-background/90 data-[disabled=true]:data-[hover=true]:border-separator/80',

  variants: {
    variant: {
      default:
        'data-[focus=true]:border-primary/80 data-[focus=true]:web:ring-1 data-[focus=true]:web:ring-inset data-[focus=true]:web:ring-accent data-[invalid=true]:border-accent data-[invalid=true]:web:ring-1 data-[invalid=true]:web:ring-inset data-[invalid=true]:web:ring-accent data-[invalid=true]:data-[hover=true]:border-accent data-[invalid=true]:data-[focus=true]:data-[hover=true]:border-primary/80 data-[invalid=true]:data-[focus=true]:data-[hover=true]:web:ring-1 data-[invalid=true]:data-[focus=true]:data-[hover=true]:web:ring-inset data-[invalid=true]:data-[focus=true]:data-[hover=true]:web:ring-accent data-[invalid=true]:data-[disabled=true]:data-[hover=true]:border-accent data-[invalid=true]:data-[disabled=true]:data-[hover=true]:web:ring-1 data-[invalid=true]:data-[disabled=true]:data-[hover=true]:web:ring-inset data-[invalid=true]:data-[disabled=true]:data-[hover=true]:web:ring-accent ',
    },
    size: {
      sm: '',
      md: '',
      lg: '',
      xl: '',
    },
  },
});

const textareaInputStyle = tva({
  base: 'p-2 web:outline-0 web:outline-none flex-1 text-text placeholder:text-text/60 web:cursor-text web:data-[disabled=true]:cursor-not-allowed',
  parentVariants: {
    size: {
      sm: 'text-sm',
      md: 'text-base',
      lg: 'text-lg',
      xl: 'text-xl',
    },
  },
});

type ITextareaProps = React.ComponentProps<typeof UITextarea> &
  VariantProps<typeof textareaStyle>;

const Textarea = React.forwardRef<
  React.ComponentRef<typeof UITextarea>,
  ITextareaProps
>(function Textarea(
  { className, variant = 'default', size = 'md', ...props },
  ref
) {
  return (
    <UITextarea
      ref={ref}
      {...props}
      className={textareaStyle({ variant, class: className })}
      context={{ size }}
    />
  );
});

type ITextareaInputProps = React.ComponentProps<typeof UITextarea.Input> &
  VariantProps<typeof textareaInputStyle>;

const TextareaInput = React.forwardRef<
  React.ComponentRef<typeof UITextarea.Input>,
  ITextareaInputProps
>(function TextareaInput({ className, style, ...props }, ref) {
  const { size: parentSize } = useStyleContext(SCOPE);
  // M24 US18 (design-settings G2): a raw TextInput skipped the face picker → system font.
  const face = useFace(className);

  return (
    <UITextarea.Input
      ref={ref}
      {...props}
      style={face ? [face, style] : style}
      // M9 (iOS, found on the phone): the creator defaults aria-label to "Input Field", and on
      // native aria-label beats accessibilityLabel — so every field was read as "Input Field".
      // The caller's name is passed on as the aria-label too.
      aria-label={props['aria-label'] ?? props.accessibilityLabel}
      textAlignVertical="top"
      className={textareaInputStyle({
        parentVariants: {
          size: parentSize,
        },
        class: className,
      })}
    />
  );
});

Textarea.displayName = 'Textarea';
TextareaInput.displayName = 'TextareaInput';

export { Textarea, TextareaInput };
