import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { DocumentConnectionState } from './CollaborativeEditor.types';
import { DocumentConnectionStatus } from './DocumentConnectionStatus';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

describe('DocumentConnectionStatus', () => {
  it.each<[DocumentConnectionState, string]>([
    ['connecting', 'bg-(--warning)'],
    ['syncing', 'bg-(--warning)'],
    ['connected', 'bg-(--success)'],
    ['disconnected', 'bg-(--destructive)'],
    ['accessDenied', 'bg-(--destructive)'],
  ])('announces %s with its own dot colour', (state, dotClass) => {
    render(<DocumentConnectionStatus state={state} />);

    const status = screen.getByRole('status');
    expect(status).toHaveTextContent(`editor.connection.${state}`);
    expect(status).toHaveAttribute('aria-live', 'polite');
    expect(status).toHaveAttribute('aria-atomic', 'true');

    const dot = status.querySelector('span');
    expect(dot).toHaveClass(dotClass);
    expect(dot).toHaveAttribute('aria-hidden', 'true');
  });

  it('leaves only the dot on small screens when compactLabel is set', () => {
    render(<DocumentConnectionStatus state="connected" compactLabel />);

    expect(screen.getByText('editor.connection.connected')).toHaveClass(
      'max-sm:sr-only'
    );
  });

  it('keeps the label visible on small screens by default', () => {
    render(<DocumentConnectionStatus state="connected" />);

    expect(screen.getByText('editor.connection.connected')).not.toHaveClass(
      'max-sm:sr-only'
    );
  });

  it('renders nothing while the connection state is unknown', () => {
    const { container } = render(<DocumentConnectionStatus state={null} />);

    expect(container).toBeEmptyDOMElement();
  });
});
