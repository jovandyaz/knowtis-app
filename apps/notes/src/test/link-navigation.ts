import { fireEvent, within } from '@testing-library/react';
import { expect } from 'vitest';

export function expectLinkNavigationBlocked(
  region: HTMLElement,
  plainText: string
): void {
  const link = within(region).getByRole('link');
  expect(fireEvent.click(link)).toBe(false);
  expect(
    fireEvent(
      link,
      new MouseEvent('auxclick', { bubbles: true, cancelable: true, button: 1 })
    )
  ).toBe(false);
  expect(fireEvent.click(within(region).getByText(plainText))).toBe(true);
}
