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

describe('NotePropertiesRow', () => {
  beforeEach(() => {
    updateMock.mockClear();
  });

  it('owner picks a bucket → PATCH with { bucket }', async () => {
    const user = userEvent.setup();
    render(<NotePropertiesRow noteId="n1" bucket={null} isOwner />);

    await user.click(screen.getByRole('button', { name: /inbox/i }));
    await user.click(screen.getByRole('menuitemradio', { name: 'Proyectos' }));

    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'n1', input: { bucket: 'projects' } })
    );
  });

  it('picking Inbox clears the bucket', async () => {
    const user = userEvent.setup();
    render(<NotePropertiesRow noteId="n1" bucket="areas" isOwner />);

    await user.click(screen.getByRole('button', { name: /áreas/i }));
    await user.click(screen.getByRole('menuitemradio', { name: 'Inbox' }));

    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'n1', input: { bucket: null } })
    );
  });

  it('marks the current bucket as checked for assistive tech', async () => {
    const user = userEvent.setup();
    render(<NotePropertiesRow noteId="n1" bucket="areas" isOwner />);

    await user.click(screen.getByRole('button', { name: /áreas/i }));

    expect(
      screen.getByRole('menuitemradio', { name: 'Áreas' })
    ).toHaveAttribute('aria-checked', 'true');
    expect(
      screen.getByRole('menuitemradio', { name: 'Inbox' })
    ).toHaveAttribute('aria-checked', 'false');
  });

  it('re-selecting the current bucket is a no-op', async () => {
    const user = userEvent.setup();
    render(<NotePropertiesRow noteId="n1" bucket="areas" isOwner />);

    await user.click(screen.getByRole('button', { name: /áreas/i }));
    await user.click(screen.getByRole('menuitemradio', { name: 'Áreas' }));

    expect(updateMock).not.toHaveBeenCalled();
  });

  it('non-owner sees a static label, no menu', () => {
    render(<NotePropertiesRow noteId="n1" bucket="areas" isOwner={false} />);

    expect(screen.getByText('Áreas')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /áreas/i })
    ).not.toBeInTheDocument();
  });
});
