import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Artifact } from '@knowtis/shared-types';

import { ArtifactList } from './ArtifactList';

const { deleteArtifact } = vi.hoisted(() => ({
  deleteArtifact: vi.fn(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) =>
      opts ? `${key} ${JSON.stringify(opts)}` : key,
  }),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@knowtis/data-access-artifacts', () => ({
  useArtifacts: () => ({ data: undefined, isLoading: false }),
  useDeleteArtifact: () => ({
    mutateAsync: deleteArtifact,
    isPending: false,
  }),
}));

const artifacts = [
  {
    id: 'a1',
    type: 'flashcard_deck',
    title: 'Fotosíntesis',
    createdAt: '2026-08-14T00:00:00.000Z',
  },
  {
    id: 'a2',
    type: 'quiz',
    title: 'Mitosis',
    createdAt: '2026-08-15T00:00:00.000Z',
  },
] as Artifact[];

const deleteLabel = (title: string) =>
  `ai.artifacts.list.deleteAriaLabel ${JSON.stringify({ title })}`;

/** The delete label repeats the title, so the open button is matched from the start. */
const openButton = (title: string) =>
  screen.getByRole('button', { name: new RegExp(`^${title}`) });

describe('ArtifactList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    deleteArtifact.mockResolvedValue(undefined);
  });

  it('lists every artifact as a list item with a real open button', () => {
    render(<ArtifactList artifacts={artifacts} onSelect={vi.fn()} />);

    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    for (const artifact of artifacts) {
      expect(openButton(artifact.title)).toBeInTheDocument();
    }
  });

  it('opens an artifact from the keyboard without a re-implemented key handler', async () => {
    const onSelect = vi.fn();
    render(<ArtifactList artifacts={artifacts} onSelect={onSelect} />);

    openButton('Fotosíntesis').focus();
    await userEvent.keyboard('{Enter}');
    await userEvent.keyboard(' ');

    expect(onSelect).toHaveBeenNthCalledWith(1, artifacts[0]);
    expect(onSelect).toHaveBeenNthCalledWith(2, artifacts[0]);
  });

  it('keeps delete a sibling button that never opens the artifact', async () => {
    const onSelect = vi.fn();
    render(<ArtifactList artifacts={artifacts} onSelect={onSelect} />);

    const remove = screen.getByRole('button', {
      name: deleteLabel('Mitosis'),
    });
    expect(
      remove.closest('button[type="button"]:not([aria-label])')
    ).toBeNull();

    await userEvent.click(remove);

    expect(deleteArtifact).toHaveBeenCalledWith('a2');
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('withholds delete from a read-only viewer', () => {
    render(<ArtifactList artifacts={artifacts} readOnly onSelect={vi.fn()} />);

    expect(
      screen.queryByRole('button', { name: deleteLabel('Mitosis') })
    ).toBeNull();
    expect(openButton('Mitosis')).toBeInTheDocument();
  });
});
