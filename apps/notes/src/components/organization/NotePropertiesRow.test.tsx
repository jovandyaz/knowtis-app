import type { ReactElement } from 'react';

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { NotePropertiesRow } from './NotePropertiesRow';

const updateMock = vi.fn();

vi.mock('@knowtis/data-access-notes', () => ({
  useUpdateNote: () => ({ mutate: updateMock }),
}));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) =>
      ({
        'organization.buckets.inbox': 'Inbox',
        'organization.buckets.projects': 'Proyectos',
        'organization.buckets.areas': 'Áreas',
        'organization.buckets.resources': 'Recursos',
        'organization.buckets.archive': 'Archivo',
      })[key] ?? key,
  }),
}));

function renderWithProviders(ui: ReactElement) {
  return render(ui);
}

describe('NotePropertiesRow', () => {
  beforeEach(() => {
    updateMock.mockClear();
  });

  it('owner picks a bucket → PATCH with { bucket }', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <NotePropertiesRow noteId="n1" bucket={null} isOwner />
    );

    await user.click(screen.getByRole('button', { name: /inbox/i }));
    await user.click(screen.getByRole('menuitem', { name: 'Proyectos' }));

    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'n1', input: { bucket: 'projects' } })
    );
  });

  it('non-owner sees a static label, no menu', () => {
    renderWithProviders(
      <NotePropertiesRow noteId="n1" bucket="areas" isOwner={false} />
    );

    expect(screen.getByText('Áreas')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /áreas/i })
    ).not.toBeInTheDocument();
  });
});
