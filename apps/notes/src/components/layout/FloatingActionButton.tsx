import type { LucideIcon } from 'lucide-react';

import { Button, cn } from '@knowtis/design-system';

interface FloatingActionButtonProps {
  icon: LucideIcon;
  position: 'left' | 'right';
  onClick?: () => void;
  'aria-label'?: string;
}

const POSITION_CLASSES = {
  left: 'left-4',
  right: 'right-4',
} as const;

export function FloatingActionButton({
  icon: Icon,
  position,
  onClick,
  'aria-label': ariaLabel,
  ...rest
}: FloatingActionButtonProps &
  Omit<
    React.ComponentProps<'button'>,
    keyof FloatingActionButtonProps | 'className' | 'type'
  >) {
  return (
    <div
      className={cn('fixed top-4 z-50 md:hidden', POSITION_CLASSES[position])}
    >
      <Button
        variant="outline"
        size="icon"
        className="h-10 w-10 rounded-full bg-(--background)/80 shadow-sm backdrop-blur-md"
        onClick={onClick}
        aria-label={ariaLabel}
        {...rest}
      >
        <Icon className="h-5 w-5" />
      </Button>
    </div>
  );
}
