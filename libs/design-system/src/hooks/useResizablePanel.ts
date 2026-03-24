import { useCallback, useEffect, useRef, useState } from 'react';

const SNAP_TRANSITION_MS = 300;

export type PanelSide = 'left' | 'right';

export interface ResizablePanelConfig {
  /** Width when the panel first opens */
  defaultWidth: number;
  /** Minimum usable width — snaps up to this on release if above collapse threshold */
  minWidth?: number;
  /** Maximum width the user can drag to */
  maxWidth: number;
  /** Below this width on release, the panel collapses */
  collapseThreshold: number;
  /** Whether the panel is currently open */
  isOpen: boolean;
  /** Called when the panel collapses via drag or keyboard */
  onCollapse: () => void;
  /** Called whenever the width changes — use to sync external state */
  onWidthChange?: (width: number) => void;
  /** Which side the panel sits on — determines drag direction */
  side: PanelSide;
}

export interface ResizablePanelState {
  width: number;
  isDragging: boolean;
  isTransitioning: boolean;
  isVisible: boolean;
  transitionStyle: string;
  handleProps: {
    onMouseDown: (e: React.MouseEvent) => void;
    onKeyDown: (e: React.KeyboardEvent) => void;
    role: 'separator';
    'aria-orientation': 'vertical';
    'aria-valuenow': number;
    'aria-valuemin': number;
    'aria-valuemax': number;
    tabIndex: 0;
  };
}

function startSnapTransition(
  snapTimeoutRef: React.RefObject<ReturnType<typeof setTimeout> | undefined>,
  setIsTransitioning: (v: boolean) => void,
  onDone?: () => void
) {
  setIsTransitioning(true);
  clearTimeout(snapTimeoutRef.current);
  snapTimeoutRef.current = setTimeout(() => {
    setIsTransitioning(false);
    onDone?.();
  }, SNAP_TRANSITION_MS);
}

/** Schedule a width change with CSS transition via double-rAF to ensure the browser paints the initial state first. */
function animateWidth(
  snapTimeoutRef: React.RefObject<ReturnType<typeof setTimeout> | undefined>,
  setWidth: (w: number) => void,
  setIsTransitioning: (v: boolean) => void,
  fromWidth: number,
  toWidth: number
) {
  clearTimeout(snapTimeoutRef.current);
  requestAnimationFrame(() => {
    setWidth(fromWidth);
    setIsTransitioning(true);
    requestAnimationFrame(() => {
      setWidth(toWidth);
      snapTimeoutRef.current = setTimeout(
        () => setIsTransitioning(false),
        SNAP_TRANSITION_MS
      );
    });
  });
}

export function useResizablePanel({
  defaultWidth,
  minWidth = 0,
  maxWidth,
  collapseThreshold,
  isOpen,
  onCollapse,
  onWidthChange,
  side,
}: ResizablePanelConfig): ResizablePanelState {
  const [width, setWidth] = useState(isOpen ? defaultWidth : 0);
  const [isDragging, setIsDragging] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);

  const widthRef = useRef(width);
  const startXRef = useRef(0);
  const startWidthRef = useRef(0);
  const snapTimeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const prevIsOpenRef = useRef(isOpen);
  const lastUserWidthRef = useRef(defaultWidth);

  useEffect(() => {
    widthRef.current = width;
  });

  useEffect(() => {
    onWidthChange?.(width);
  }, [width, onWidthChange]);

  // React to external open/close (e.g. toggle button)
  useEffect(() => {
    if (isOpen === prevIsOpenRef.current) {
      return;
    }
    prevIsOpenRef.current = isOpen;

    if (isDragging) {
      return;
    }

    if (isOpen) {
      animateWidth(
        snapTimeoutRef,
        setWidth,
        setIsTransitioning,
        0,
        lastUserWidthRef.current
      );
    } else {
      animateWidth(
        snapTimeoutRef,
        setWidth,
        setIsTransitioning,
        widthRef.current,
        0
      );
    }
  }, [isOpen, isDragging]);

  useEffect(() => {
    const ref = snapTimeoutRef;
    return () => clearTimeout(ref.current);
  }, []);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      startXRef.current = e.clientX;
      startWidthRef.current = widthRef.current;
      setIsDragging(true);
      setIsTransitioning(false);
      clearTimeout(snapTimeoutRef.current);

      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';

      const handleMouseMove = (moveEvent: MouseEvent) => {
        const delta = moveEvent.clientX - startXRef.current;
        const newWidth =
          side === 'right'
            ? startWidthRef.current - delta
            : startWidthRef.current + delta;
        const clamped = Math.max(0, Math.min(maxWidth, newWidth));
        widthRef.current = clamped;
        setWidth(clamped);
      };

      const handleMouseUp = () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';

        setIsDragging(false);

        const currentWidth = widthRef.current;

        if (currentWidth < collapseThreshold) {
          setWidth(0);
          startSnapTransition(snapTimeoutRef, setIsTransitioning, onCollapse);
          return;
        }

        const snappedWidth = Math.max(currentWidth, minWidth);
        lastUserWidthRef.current = snappedWidth;

        if (snappedWidth !== currentWidth) {
          setWidth(snappedWidth);
          startSnapTransition(snapTimeoutRef, setIsTransitioning);
        }
      };

      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    },
    [maxWidth, minWidth, collapseThreshold, onCollapse, side]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        if (isOpen) {
          setWidth(0);
          startSnapTransition(snapTimeoutRef, setIsTransitioning, onCollapse);
        }
      }
    },
    [isOpen, onCollapse]
  );

  const transitionStyle = isDragging
    ? 'none'
    : isTransitioning
      ? `width ${SNAP_TRANSITION_MS}ms ease`
      : 'none';

  const isVisible = width > 0 || isTransitioning;

  return {
    width,
    isDragging,
    isTransitioning,
    isVisible,
    transitionStyle,
    handleProps: {
      onMouseDown: handleMouseDown,
      onKeyDown: handleKeyDown,
      role: 'separator' as const,
      'aria-orientation': 'vertical' as const,
      'aria-valuenow': width,
      'aria-valuemin': 0,
      'aria-valuemax': maxWidth,
      tabIndex: 0 as const,
    },
  };
}
