import { forwardRef, type ComponentPropsWithoutRef } from 'react';

import type { PanelSide } from '../hooks/useResizablePanel';
import { cn } from '../utils/cn';

const POSITION_CLASSES: Record<PanelSide, string> = {
  left: 'left-0 after:left-0',
  right: 'right-0 after:right-0',
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
        "absolute top-0 bottom-0 w-2 z-10 cursor-col-resize outline-none bg-transparent after:absolute after:inset-y-0 after:w-px after:content-[''] after:transition-colors after:duration-(--motion-duration-fast) after:ease-standard motion-reduce:after:transition-none",
        POSITION_CLASSES[side],
        isDragging
          ? 'after:bg-primary'
          : 'after:bg-border hover:after:bg-primary/40 focus-visible:after:bg-primary focus-visible:after:w-0.5'
      )}
    />
  )
);
ResizeHandle.displayName = 'ResizeHandle';

export { ResizeHandle };
