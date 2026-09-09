import { forwardRef, type ComponentPropsWithoutRef } from 'react';

import type { PanelSide } from '../hooks/useResizablePanel';
import { cn } from '../utils/cn';

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

const ResizeHandle = forwardRef<HTMLDivElement, ResizeHandleProps>(
  ({ isDragging, side, ...props }, ref) => (
    <div
      ref={ref}
      {...props}
      className={cn(
        'absolute top-0 bottom-0 w-1.5 z-10 cursor-col-resize outline-none transition-colors',
        POSITION_CLASSES[side],
        isDragging
          ? 'bg-primary'
          : 'bg-transparent hover:bg-primary/40 focus-visible:bg-primary/40'
      )}
    />
  )
);
ResizeHandle.displayName = 'ResizeHandle';

export { ResizeHandle };
