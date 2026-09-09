import { forwardRef, type ReactNode } from 'react';

import {
  useResizablePanel,
  type PanelSide,
  type ResizablePanelConfig,
} from '../hooks/useResizablePanel';
import { cn } from '../utils/cn';
import { ResizeHandle } from './ResizeHandle';

const HANDLE_SIDE: Record<PanelSide, PanelSide> = {
  left: 'right',
  right: 'left',
};

interface ResizablePanelProps extends ResizablePanelConfig {
  children: ReactNode;
  className?: string;
  /** Label for the resize handle (accessibility) */
  handleAriaLabel?: string;
}

const ResizablePanel = forwardRef<HTMLElement, ResizablePanelProps>(
  (
    { children, className, handleAriaLabel = 'Resize panel', ...config },
    ref
  ) => {
    const { width, isDragging, isVisible, transitionStyle, handleProps } =
      useResizablePanel(config);

    if (!isVisible) {
      return null;
    }

    return (
      <aside
        ref={ref}
        className={cn('shrink-0 overflow-hidden relative', className)}
        style={{
          width: `${width}px`,
          transition: transitionStyle,
        }}
      >
        <ResizeHandle
          isDragging={isDragging}
          side={HANDLE_SIDE[config.side]}
          {...handleProps}
          aria-label={handleAriaLabel}
        />
        {children}
      </aside>
    );
  }
);
ResizablePanel.displayName = 'ResizablePanel';

export { ResizablePanel };
