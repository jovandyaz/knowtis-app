import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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

  it('hides its rows but keeps the title when collapsed', async () => {
    const user = userEvent.setup();
    renderSection();

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

  it('names the action the click performs', async () => {
    const user = userEvent.setup();
    renderSection();

    expect(header()).toHaveAttribute('title', 'labels.collapse');
    await user.click(header());

    expect(header()).toHaveAttribute('title', 'labels.expand');
  });
});
