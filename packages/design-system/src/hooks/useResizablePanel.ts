import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';

import { useMotionPreset } from '../motion/useMotionPreset';

const SNAP_TRANSITION_MS = 300;
const KEYBOARD_STEP = 8;
// Collapsing is Enter/Space only, so the keyboard must never land on a width
// that unmounts the panel behind the consumer's back.
const KEYBOARD_MIN_WIDTH = 1;

export type PanelSide = 'left' | 'right';

export interface ResizablePanelConfig {
  /** Width the panel opens at until the user resizes it; once they have,
   *  their width wins over any later default. */
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
  /** Called whenever the width changes, before the browser paints it, so
   *  layout that follows the panel never shows a stale width. */
  onWidthChange?: (width: number) => void;
  /** Called with the width the user settled on, after a drag release that does
   *  not collapse and after every keyboard adjustment — use to persist it. */
  onResizeEnd?: (width: number) => void;
  /** When set, the panel animates to this width and holds it; clearing it
   *  animates back to the width the user had before. */
  targetWidth?: number | undefined;
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

function keyboardTargetWidth(
  key: string,
  currentWidth: number,
  side: PanelSide,
  minWidth: number,
  maxWidth: number
): number | null {
  const step = side === 'left' ? KEYBOARD_STEP : -KEYBOARD_STEP;

  if (key === 'ArrowRight') {
    return currentWidth + step;
  }
  if (key === 'ArrowLeft') {
    return currentWidth - step;
  }
  if (key === 'Home') {
    return minWidth;
  }
  if (key === 'End') {
    return maxWidth;
  }
  return null;
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
  onResizeEnd,
  targetWidth,
  side,
}: ResizablePanelConfig): ResizablePanelState {
  const { reduced } = useMotionPreset();
  const [userWidth, setWidth] = useState(isOpen ? defaultWidth : 0);
  // Layout can take the room back at any time, so the maximum is applied on
  // read: the width the user chose survives and returns when the room does.
  const width = Math.min(userWidth, maxWidth);
  // A minimum above the maximum would push the panel past the room it has.
  const effectiveMinWidth = Math.min(minWidth, maxWidth);
  const [isDragging, setIsDragging] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);

  const widthRef = useRef(width);
  const userWidthRef = useRef(userWidth);
  const startXRef = useRef(0);
  const startWidthRef = useRef(0);
  const snapTimeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const prevIsOpenRef = useRef(isOpen);
  const lastUserWidthRef = useRef(defaultWidth);
  const userSetWidthRef = useRef(false);
  const targetWidthRef = useRef<number | undefined>(undefined);
  const restoreWidthRef = useRef<number | null>(null);

  useEffect(() => {
    widthRef.current = width;
    userWidthRef.current = userWidth;
  });

  useEffect(() => {
    if (!userSetWidthRef.current) {
      lastUserWidthRef.current = defaultWidth;
    }
  }, [defaultWidth]);

  useLayoutEffect(() => {
    onWidthChange?.(width);
  }, [width, onWidthChange]);

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
        targetWidthRef.current ?? lastUserWidthRef.current
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
    if (targetWidth === targetWidthRef.current) {
      return;
    }

    if (isDragging) {
      return;
    }

    const previousTarget = targetWidthRef.current;
    targetWidthRef.current = targetWidth;

    if (!isOpen) {
      return;
    }

    if (targetWidth !== undefined) {
      if (previousTarget === undefined) {
        restoreWidthRef.current =
          userWidthRef.current > 0
            ? userWidthRef.current
            : lastUserWidthRef.current;
      }
      animateWidth(
        snapTimeoutRef,
        setWidth,
        setIsTransitioning,
        widthRef.current,
        Math.min(targetWidth, maxWidth)
      );
      return;
    }

    const restore = restoreWidthRef.current ?? lastUserWidthRef.current;
    restoreWidthRef.current = null;
    animateWidth(
      snapTimeoutRef,
      setWidth,
      setIsTransitioning,
      widthRef.current,
      restore
    );
  }, [targetWidth, isOpen, isDragging, maxWidth]);

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

        const snappedWidth = Math.max(currentWidth, effectiveMinWidth);
        if (targetWidthRef.current === undefined) {
          lastUserWidthRef.current = snappedWidth;
          userSetWidthRef.current = true;
          onResizeEnd?.(snappedWidth);
        }

        if (snappedWidth !== currentWidth) {
          setWidth(snappedWidth);
          startSnapTransition(snapTimeoutRef, setIsTransitioning);
        }
      };

      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    },
    [
      maxWidth,
      effectiveMinWidth,
      collapseThreshold,
      onCollapse,
      onResizeEnd,
      side,
    ]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        if (isOpen) {
          setWidth(0);
          startSnapTransition(snapTimeoutRef, setIsTransitioning, onCollapse);
        }
        return;
      }

      const next = keyboardTargetWidth(
        e.key,
        widthRef.current,
        side,
        effectiveMinWidth,
        maxWidth
      );
      if (next === null) {
        return;
      }

      e.preventDefault();

      if (!isOpen || isDragging || targetWidth !== undefined) {
        return;
      }

      const clamped = Math.min(
        maxWidth,
        Math.max(KEYBOARD_MIN_WIDTH, effectiveMinWidth, next)
      );
      widthRef.current = clamped;
      lastUserWidthRef.current = clamped;
      userSetWidthRef.current = true;
      setWidth(clamped);
      onResizeEnd?.(clamped);
    },
    [
      isOpen,
      isDragging,
      targetWidth,
      effectiveMinWidth,
      maxWidth,
      side,
      onCollapse,
      onResizeEnd,
    ]
  );

  const transitionStyle =
    isDragging || !isTransitioning || reduced
      ? 'none'
      : `width ${SNAP_TRANSITION_MS}ms ease`;

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
      // A drag can go under minWidth and a collapse animates through 0 while
      // the handle is still mounted; WAI-ARIA needs valuenow inside the range.
      'aria-valuemin': 0,
      'aria-valuemax': maxWidth,
      tabIndex: 0 as const,
    },
  };
}
