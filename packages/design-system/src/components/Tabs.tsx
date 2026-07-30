import {
  forwardRef,
  useCallback,
  useState,
  type ComponentPropsWithoutRef,
  type ComponentRef,
  type ForwardedRef,
} from 'react';

import * as TabsPrimitive from '@radix-ui/react-tabs';

import { cn } from '../utils';
import {
  readOverflow,
  TABS_FOCUS_MASK_RESET_CLASS,
  TABS_OVERFLOW,
  TABS_OVERFLOW_MASK_CLASS,
  type TabsOverflow,
} from './tabs-overflow';

type TabsListElement = ComponentRef<typeof TabsPrimitive.List>;

function assignRef(
  ref: ForwardedRef<TabsListElement>,
  node: TabsListElement | null
) {
  if (typeof ref === 'function') {
    ref(node);
  } else if (ref) {
    ref.current = node;
  }
}

export const Tabs = TabsPrimitive.Root;

/**
 * Radix tab strip that fades the edges it can still be scrolled towards and
 * reflects that measured state on its own `data-overflow` attribute.
 */
export const TabsList = forwardRef<
  TabsListElement,
  ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => {
  const [overflow, setOverflow] = useState<TabsOverflow>(TABS_OVERFLOW.NONE);

  const attachList = useCallback(
    (node: TabsListElement | null) => {
      assignRef(ref, node);
      if (!node) {
        return;
      }

      const sync = () => setOverflow(readOverflow(node));
      sync();

      node.addEventListener('scroll', sync, { passive: true });
      const resizeObserver = new ResizeObserver(sync);
      resizeObserver.observe(node);
      // The list is w-full, so a changed trigger set moves scrollWidth without
      // resizing the border box the ResizeObserver watches.
      const mutationObserver = new MutationObserver(sync);
      mutationObserver.observe(node, {
        childList: true,
        subtree: true,
        characterData: true,
      });

      return () => {
        node.removeEventListener('scroll', sync);
        resizeObserver.disconnect();
        mutationObserver.disconnect();
        assignRef(ref, null);
      };
    },
    [ref]
  );

  return (
    <TabsPrimitive.List
      ref={attachList}
      data-overflow={overflow}
      className={cn(
        'inline-flex w-full items-center gap-1 overflow-x-auto rounded-md bg-(--muted) p-1',
        TABS_OVERFLOW_MASK_CLASS[overflow],
        TABS_FOCUS_MASK_RESET_CLASS,
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
