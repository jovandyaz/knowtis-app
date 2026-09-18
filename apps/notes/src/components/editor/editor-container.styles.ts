import { cn } from '@knowtis/design-system';

export const EDITOR_PADDING = 'p-4 md:p-6';

export const EDITOR_MIN_HEIGHT = 'min-h-[300px]';

export const EDITOR_CONTAINER_CLASSES = cn(
  'rounded-lg border border-border bg-card',
  'transition-colors duration-(--motion-duration-fast) motion-reduce:transition-none',
  'focus-within:border-primary'
);
