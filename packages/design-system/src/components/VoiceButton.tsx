import { forwardRef, type ButtonHTMLAttributes } from 'react';

import { cva, type VariantProps } from 'class-variance-authority';
import { Loader2, Mic, MicOff, Pause } from 'lucide-react';

import { cn } from '../utils';

const voiceButtonVariants = cva(
  'inline-flex items-center justify-center rounded-full transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--ring) focus-visible:ring-offset-2',
  {
    variants: {
      state: {
        idle: 'cursor-pointer',
        listening:
          'bg-red-500 text-white cursor-pointer animate-pulse shadow-[0_0_16px_4px_rgba(239,68,68,0.4)]',
        paused: 'bg-amber-500 text-white cursor-pointer hover:bg-amber-500/90',
        processing: 'bg-(--muted) text-(--muted-foreground) cursor-wait',
        disabled:
          'bg-(--muted) text-(--muted-foreground) opacity-50 cursor-not-allowed',
      },
      emphasis: {
        solid: '',
        quiet: '',
      },
      size: {
        sm: 'size-8',
        default: 'size-10',
        md: 'size-12',
        lg: 'size-14',
        xl: 'size-16',
      },
    },
    compoundVariants: [
      {
        state: 'idle',
        emphasis: 'solid',
        class:
          'bg-(--primary) text-(--primary-foreground) hover:bg-(--primary)/90',
      },
      {
        state: 'idle',
        emphasis: 'quiet',
        class:
          'border border-(--border) bg-(--card) text-(--primary) shadow-lg hover:bg-(--muted)',
      },
    ],
    defaultVariants: {
      state: 'idle',
      emphasis: 'solid',
      size: 'default',
    },
  }
);

const ariaLabelMap: Record<NonNullable<VoiceButtonProps['state']>, string> = {
  idle: 'Start recording',
  listening: 'Stop recording',
  paused: 'Resume recording',
  processing: 'Processing audio',
  disabled: 'Voice recording unavailable',
};

const iconSizeMap = {
  sm: 'size-4',
  default: 'size-5',
  md: 'size-5',
  lg: 'size-6',
  xl: 'size-7',
} as const;

export interface VoiceButtonProps
  extends
    Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'disabled'>,
    VariantProps<typeof voiceButtonVariants> {}

export const VoiceButton = forwardRef<HTMLButtonElement, VoiceButtonProps>(
  ({ className, state, emphasis, size, ...props }, ref) => {
    const resolvedState = state ?? 'idle';
    const resolvedSize = size ?? 'default';
    const iconClass = iconSizeMap[resolvedSize];

    const icon = (() => {
      switch (resolvedState) {
        case 'listening':
          return <Mic className={iconClass} />;
        case 'paused':
          return <Pause className={iconClass} />;
        case 'processing':
          return <Loader2 className={cn(iconClass, 'animate-spin')} />;
        case 'disabled':
          return <MicOff className={iconClass} />;
        default:
          return <Mic className={iconClass} />;
      }
    })();

    return (
      <button
        type="button"
        className={cn(
          voiceButtonVariants({ state, emphasis, size, className })
        )}
        ref={ref}
        disabled={
          resolvedState === 'disabled' || resolvedState === 'processing'
        }
        aria-label={ariaLabelMap[resolvedState]}
        {...props}
      >
        {icon}
      </button>
    );
  }
);

VoiceButton.displayName = 'VoiceButton';
