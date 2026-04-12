import type { ReactNode } from 'react';

import {
  useResizablePanel,
  type PanelSide,
  type ResizablePanelConfig,
} from '../hooks/useResizablePanel';
import { cn } from '../utils';
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

export function ResizablePanel({
  children,
  className,
  handleAriaLabel = 'Resize panel',
  ...config
}: ResizablePanelProps) {
  const { width, isDragging, isVisible, transitionStyle, handleProps } =
    useResizablePanel(config);

  if (!isVisible) {
    return null;
  }

  return (
    <aside
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
