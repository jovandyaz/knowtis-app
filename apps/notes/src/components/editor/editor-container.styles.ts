import { cn } from '@knowtis/design-system';

export const EDITOR_PADDING = 'p-4 md:p-6';

export const EDITOR_MIN_HEIGHT = 'min-h-[300px]';

export const EDITOR_CONTAINER_CLASSES = cn(
  'rounded-2xl border border-border bg-card/50 backdrop-blur-sm',
  'transition-all duration-300',
  'focus-within:border-primary/50 focus-within:shadow-lg focus-within:shadow-primary/5'
);
