import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TOUCH_TARGET_HEIGHT_CLASS } from '@knowtis/design-system';

import { SidebarSection } from './SidebarSection';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const STORAGE_KEY = 'sidebar-section-test';

function renderSection() {
  return render(
    <SidebarSection title="Etiquetas" storageKey={STORAGE_KEY}>
      <a href="/notes">work</a>
    </SidebarSection>
  );
}

const header = () => screen.getByRole('button', { name: 'Etiquetas' });

describe('SidebarSection', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('opens showing its rows', () => {
    renderSection();

    expect(header()).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('work')).toBeInTheDocument();
  });

  it('keeps section titles readable in a compact sentence-case header', () => {
    renderSection();

    expect(header()).toHaveClass(
      'min-h-7',
      'px-2',
      'py-1',
      'text-xs',
      'leading-4',
      'font-medium',
      'normal-case',
      'tracking-normal',
      'text-foreground',
      'dark:text-muted-foreground',
      'dark:hover:text-foreground'
    );
    expect(header()).not.toHaveClass(
      'uppercase',
      'tracking-wider',
      'text-muted-foreground/60',
      'hover:text-foreground'
    );
  });

  it('hides its rows but keeps the title when collapsed', async () => {
    const user = userEvent.setup();
    renderSection();
    expect(screen.getByText('work')).toBeInTheDocument();

    await user.click(header());

    expect(header()).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('work')).not.toBeInTheDocument();
  });

  it('reopens what was collapsed', async () => {
    const user = userEvent.setup();
    renderSection();

    await user.click(header());
    await user.click(header());

    expect(screen.getByText('work')).toBeInTheDocument();
  });

  it('reopens collapsed on the next visit', async () => {
    const user = userEvent.setup();
    const first = renderSection();
    await user.click(header());
    first.unmount();

    renderSection();

    expect(header()).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('work')).not.toBeInTheDocument();
  });

  it('gives the header a touch-sized target on a phone', () => {
    renderSection();

    expect(header()).toHaveClass(...TOUCH_TARGET_HEIGHT_CLASS.split(' '));
  });

  it('names the region it controls for assistive tech', () => {
    renderSection();

    const region = header().getAttribute('aria-controls');
    expect(region).toBeTruthy();
    expect(document.getElementById(region as string)).toContainElement(
      screen.getByText('work')
    );
  });

  it('names the action the click performs', async () => {
    const user = userEvent.setup();
    renderSection();

    expect(header()).toHaveAttribute('title', 'labels.collapse');
    await user.click(header());

    expect(header()).toHaveAttribute('title', 'labels.expand');
  });
});
