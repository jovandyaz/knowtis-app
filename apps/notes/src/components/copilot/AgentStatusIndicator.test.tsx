import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { AgentStatusIndicator } from './AgentStatusIndicator';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

const SCROLL_HEIGHT = 500;
let scrollHeightSpy: PropertyDescriptor | undefined;

beforeAll(() => {
  scrollHeightSpy = Object.getOwnPropertyDescriptor(
    HTMLElement.prototype,
    'scrollHeight'
  );
  Object.defineProperty(HTMLElement.prototype, 'scrollHeight', {
    configurable: true,
    get: () => SCROLL_HEIGHT,
  });
});

afterAll(() => {
  if (scrollHeightSpy) {
    Object.defineProperty(
      HTMLElement.prototype,
      'scrollHeight',
      scrollHeightSpy
    );
  }
});

describe('AgentStatusIndicator', () => {
  it('renders a status label and skeleton lines', () => {
    const { container } = render(<AgentStatusIndicator />);
    expect(screen.getByRole('status')).toHaveTextContent('ai.copilot.thinking');
    expect(
      container.querySelectorAll('[data-testid="shimmer-line"]').length
    ).toBeGreaterThanOrEqual(3);
  });

  it('shows the live reasoning tail when provided', () => {
    render(<AgentStatusIndicator detail="scanning sources" />);
    expect(screen.getByText('scanning sources')).toBeInTheDocument();
  });

  it('offers no reasoning toggle without a detail', () => {
    render(<AgentStatusIndicator />);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('treats a whitespace-only detail as no reasoning', () => {
    render(<AgentStatusIndicator detail={'  \n  '} />);
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByRole('status')).toHaveTextContent('ai.copilot.thinking');
  });

  it('keeps the shimmer block hidden from assistive tech', () => {
    const { container } = render(<AgentStatusIndicator detail="reasoning" />);
    const shimmer = container.querySelector('[data-testid="shimmer-line"]');
    expect(shimmer?.closest('[aria-hidden="true"]')).not.toBeNull();
  });

  it('keeps the reasoning out of any live announcement', () => {
    render(<AgentStatusIndicator detail="scanning sources" />);
    const tail = screen.getByText('scanning sources');
    expect(tail).toHaveAttribute('aria-live', 'off');
    expect(tail.closest('[role="status"]')).toBeNull();
  });

  it('pins the collapsed preview to the newest reasoning', () => {
    render(<AgentStatusIndicator detail="scanning sources" />);
    const preview = screen.getByText('scanning sources');
    expect(preview).toHaveClass('max-h-12', 'overflow-hidden');
    expect(preview.scrollTop).toBe(SCROLL_HEIGHT);
  });

  it('swaps the clamped tail for a named scrollable region once expanded', async () => {
    const user = userEvent.setup();
    render(<AgentStatusIndicator detail="scanning sources" />);

    await user.click(screen.getByRole('button'));

    const expanded = screen.getByText('scanning sources');
    expect(expanded).toHaveClass('max-h-32', 'overflow-y-auto');
    expect(expanded).toHaveAttribute('tabindex', '0');
    expect(expanded).toHaveAccessibleName('ai.copilot.thinking');
    expect(expanded.scrollTop).toBe(SCROLL_HEIGHT);
  });

  it('trades the shimmer for a reasoning label while answering', () => {
    const { container } = render(
      <AgentStatusIndicator detail="scanning sources" answering />
    );
    expect(screen.getByRole('button')).toHaveTextContent(
      'ai.copilot.reasoning'
    );
    expect(container.querySelector('[data-testid="shimmer-line"]')).toBeNull();
  });

  it('renders nothing while answering without reasoning', () => {
    const { container } = render(<AgentStatusIndicator answering />);
    expect(container).toBeEmptyDOMElement();
  });
});
