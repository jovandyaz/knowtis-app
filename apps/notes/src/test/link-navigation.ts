import { fireEvent, within } from '@testing-library/react';
import { expect, vi } from 'vitest';

const LINK_TARGETS = 'a, area, [data-streamdown="link"]';
const XLINK_NS = 'http://www.w3.org/1999/xlink';
const MIDDLE_BUTTON = 1;

/** What a plain click on every link-like element of a region did. */
export interface PlainClickOutcome {
  /** Links, areas and Streamdown link buttons clicked. */
  readonly clicked: number;
  /** Each navigation the clicks started, and every form, which navigates on submit. */
  readonly navigations: readonly string[];
}

function linkUrl(element: Element): string | null {
  return (
    element.getAttribute('href') ?? element.getAttributeNS(XLINK_NS, 'href')
  );
}

/**
 * Clicks, then middle-clicks, every link-like element in `region` the way a
 * user would, and reports what navigated: a click on an element that carries a
 * URL and was not default-prevented, or any `window.open`.
 */
export function plainClickOutcome(region: Element): PlainClickOutcome {
  const open = vi.spyOn(window, 'open').mockReturnValue(null);
  const navigations: string[] = [...region.querySelectorAll('form')].map(
    (form) => `form[action=${form.getAttribute('action') ?? ''}]`
  );
  const targets = [...region.querySelectorAll(LINK_TARGETS)];
  try {
    for (const target of targets) {
      const url = linkUrl(target);
      const clicks = [
        fireEvent.click(target),
        fireEvent(
          target,
          new MouseEvent('auxclick', {
            bubbles: true,
            cancelable: true,
            button: MIDDLE_BUTTON,
          })
        ),
      ];
      if (url !== null && clicks.some((notPrevented) => notPrevented)) {
        navigations.push(`${target.localName}[href=${url}]`);
      }
    }
    navigations.push(
      ...open.mock.calls.map(([url]) => `window.open(${String(url)})`)
    );
  } finally {
    open.mockRestore();
  }
  return { clicked: targets.length, navigations };
}

export function expectLinkNavigationBlocked(
  region: HTMLElement,
  plainText: string
): void {
  const link = within(region).getByRole('link');
  expect(fireEvent.click(link)).toBe(false);
  expect(
    fireEvent(
      link,
      new MouseEvent('auxclick', {
        bubbles: true,
        cancelable: true,
        button: MIDDLE_BUTTON,
      })
    )
  ).toBe(false);
  expect(fireEvent.click(within(region).getByText(plainText))).toBe(true);
}
