import { act, fireEvent } from '@testing-library/react';

export function pressEscape(): void {
  act(() => {
    fireEvent.keyDown(document.activeElement ?? document.body, {
      key: 'Escape',
    });
  });
}
