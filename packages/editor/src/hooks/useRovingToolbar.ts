import {
  useLayoutEffect,
  useState,
  type FocusEvent,
  type KeyboardEvent,
  type RefObject,
} from 'react';

const ITEM_ATTRIBUTE = 'data-toolbar-item';

/** Props each toolbar control spreads onto its focusable element. */
export interface ToolbarItemProps {
  tabIndex: number;
  [ITEM_ATTRIBUTE]: string;
}

interface RovingToolbar {
  itemProps: (id: string) => ToolbarItemProps;
  onFocus: (event: FocusEvent<HTMLElement>) => void;
  onKeyDown: (event: KeyboardEvent<HTMLElement>) => void;
}

function enabledItems(row: HTMLElement): HTMLElement[] {
  return Array.from(
    row.querySelectorAll<HTMLElement>(`[${ITEM_ATTRIBUTE}]:not(:disabled)`)
  );
}

function destinationOf(
  key: string,
  items: readonly HTMLElement[],
  index: number
): HTMLElement | undefined {
  switch (key) {
    case 'ArrowRight':
      return items[(index + 1) % items.length];
    case 'ArrowLeft':
      return items[(index - 1 + items.length) % items.length];
    case 'Home':
      return items[0];
    case 'End':
      return items[items.length - 1];
    default:
      return undefined;
  }
}

/**
 * Roving tabindex for a horizontal toolbar (WAI-ARIA APG): exactly one enabled
 * control is tabbable, ArrowLeft/ArrowRight move between enabled controls and
 * wrap, Home/End jump to the ends. Controls are read from the row's DOM, so
 * the set may change between renders; when the tab stop's control leaves the
 * row or becomes disabled, the stop moves to the first enabled control.
 * Keys are only handled when a control itself has focus, so popups and fields
 * inside the row keep their own keyboard handling.
 */
export function useRovingToolbar(
  rowRef: RefObject<HTMLElement | null>
): RovingToolbar {
  const [tabStop, setTabStop] = useState<string | null>(null);

  // eslint-disable-next-line react-hooks/exhaustive-deps -- any render can add, remove or disable a control
  useLayoutEffect(() => {
    const row = rowRef.current;
    if (!row) {
      return;
    }
    const items = enabledItems(row);
    const [first] = items;
    if (first && !items.some((item) => item.tabIndex === 0)) {
      setTabStop(first.getAttribute(ITEM_ATTRIBUTE));
    }
  });

  return {
    itemProps: (id) => ({
      tabIndex: id === tabStop ? 0 : -1,
      [ITEM_ATTRIBUTE]: id,
    }),
    onFocus: (event) => {
      const id = event.target.getAttribute(ITEM_ATTRIBUTE);
      if (id !== null) {
        setTabStop(id);
      }
    },
    onKeyDown: (event) => {
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
        return;
      }
      const items = enabledItems(event.currentTarget);
      const index = items.findIndex((item) => item === event.target);
      if (index === -1) {
        return;
      }
      const destination = destinationOf(event.key, items, index);
      if (destination) {
        event.preventDefault();
        destination.focus();
      }
    },
  };
}
