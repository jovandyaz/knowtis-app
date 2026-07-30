import {
  forwardRef,
  useCallback,
  useEffect,
  useState,
  type ComponentPropsWithoutRef,
  type ComponentRef,
} from 'react';

import * as TabsPrimitive from '@radix-ui/react-tabs';

import { cn } from '../utils';

const SCROLL_EDGE_TOLERANCE_PX = 1;

const TABS_OVERFLOW = {
  NONE: 'none',
  START: 'start',
  END: 'end',
  BOTH: 'both',
} as const;

type TabsOverflow = (typeof TABS_OVERFLOW)[keyof typeof TABS_OVERFLOW];

type TabsListElement = ComponentRef<typeof TabsPrimitive.List>;

function readOverflow(element: TabsListElement): TabsOverflow {
  const canScrollToStart = element.scrollLeft > SCROLL_EDGE_TOLERANCE_PX;
  const canScrollToEnd =
    element.scrollWidth - element.clientWidth - element.scrollLeft >
    SCROLL_EDGE_TOLERANCE_PX;

  if (canScrollToStart && canScrollToEnd) {
    return TABS_OVERFLOW.BOTH;
  }
  if (canScrollToStart) {
    return TABS_OVERFLOW.START;
  }
  if (canScrollToEnd) {
    return TABS_OVERFLOW.END;
  }
  return TABS_OVERFLOW.NONE;
}

function useTabsOverflow(element: TabsListElement | null): TabsOverflow {
  const [overflow, setOverflow] = useState<TabsOverflow>(TABS_OVERFLOW.NONE);

  useEffect(() => {
    if (!element) {
      return;
    }

    const sync = () => setOverflow(readOverflow(element));
    sync();

    element.addEventListener('scroll', sync, { passive: true });
    const observer =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(sync);
    observer?.observe(element);

    return () => {
      element.removeEventListener('scroll', sync);
      observer?.disconnect();
    };
  }, [element]);

  return overflow;
}

export const Tabs = TabsPrimitive.Root;

export const TabsList = forwardRef<
  TabsListElement,
  ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => {
  const [element, setElement] = useState<TabsListElement | null>(null);
  const overflow = useTabsOverflow(element);

  const attachRef = useCallback(
    (node: TabsListElement | null) => {
      setElement(node);
      if (typeof ref === 'function') {
        ref(node);
      } else if (ref) {
        ref.current = node;
      }
    },
    [ref]
  );

  return (
    <TabsPrimitive.List
      ref={attachRef}
      data-overflow={overflow}
      className={cn(
        'inline-flex w-full items-center gap-1 overflow-x-auto rounded-md bg-(--muted) p-1',
        'data-[overflow=end]:mask-r-from-85%',
        'data-[overflow=start]:mask-l-from-85%',
        'data-[overflow=both]:mask-x-from-85%',
        className
      )}
      {...props}
    />
  );
});
TabsList.displayName = 'TabsList';

export const TabsTrigger = forwardRef<
  ComponentRef<typeof TabsPrimitive.Trigger>,
  ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      'inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5',
      'text-sm font-medium text-(--muted-foreground) transition-colors',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--primary)',
      'disabled:pointer-events-none disabled:opacity-50',
      'data-[state=active]:bg-(--background) data-[state=active]:text-(--foreground) data-[state=active]:shadow-sm',
      className
    )}
    {...props}
  />
));
TabsTrigger.displayName = 'TabsTrigger';

export const TabsContent = forwardRef<
  ComponentRef<typeof TabsPrimitive.Content>,
  ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn(
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--primary)',
      className
    )}
    {...props}
  />
));
TabsContent.displayName = 'TabsContent';
