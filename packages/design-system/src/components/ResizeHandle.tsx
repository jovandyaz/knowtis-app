import type { ComponentPropsWithoutRef } from 'react';

import type { PanelSide } from '../hooks/useResizablePanel';
import { cn } from '../utils';

const POSITION_CLASSES: Record<PanelSide, string> = {
  left: 'left-0 -ml-px',
  right: 'right-0 -mr-px',
};

interface ResizeHandleProps extends Omit<
  ComponentPropsWithoutRef<'div'>,
  'className'
> {
  isDragging: boolean;
  side: PanelSide;
}

export function ResizeHandle({
  isDragging,
  side,
  ...props
}: ResizeHandleProps) {
  return (
    <div
      {...props}
      className={cn(
        'absolute top-0 bottom-0 w-1.5 z-10 cursor-col-resize outline-none transition-colors',
        POSITION_CLASSES[side],
        isDragging
          ? 'bg-primary'
          : 'bg-transparent hover:bg-primary/40 focus-visible:bg-primary/40'
      )}
    />
  );
}
