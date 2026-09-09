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

const ARTIFACTS: Artifact[] = [
  {
    id: 'a1',
    userId: 'u1',
    sourceNoteId: 'note-1',
    type: 'flashcard_deck',
    title: 'Fotosíntesis',
    content: { cards: [] },
    createdAt: '2026-08-14T00:00:00.000Z',
    updatedAt: '2026-08-14T00:00:00.000Z',
  },
  {
    id: 'a2',
    userId: 'u1',
    sourceNoteId: 'note-1',
    type: 'quiz',
    title: 'Mitosis',
    content: { questions: [] },
    createdAt: '2026-08-15T00:00:00.000Z',
    updatedAt: '2026-08-15T00:00:00.000Z',
  },
];

const deleteLabel = (title: string) =>
  `ai.artifacts.list.deleteAriaLabel ${JSON.stringify({ title })}`;

const openButton = (title: string) =>
  screen.getByRole('button', { name: new RegExp(`^${title}`) });

describe('ArtifactList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    deleteArtifact.mockResolvedValue(undefined);
  });

  it('lists every artifact as a list item with a real open button', () => {
    render(<ArtifactList artifacts={ARTIFACTS} onSelect={vi.fn()} />);

    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    for (const artifact of ARTIFACTS) {
      expect(openButton(artifact.title)).toBeInTheDocument();
    }
  });

  it('opens an artifact from the keyboard without a re-implemented key handler', async () => {
    const onSelect = vi.fn();
    render(<ArtifactList artifacts={ARTIFACTS} onSelect={onSelect} />);

    openButton('Fotosíntesis').focus();
    await userEvent.keyboard('{Enter}');
    await userEvent.keyboard(' ');

    expect(onSelect).toHaveBeenNthCalledWith(1, ARTIFACTS[0]);
    expect(onSelect).toHaveBeenNthCalledWith(2, ARTIFACTS[0]);
  });

  it('keeps delete a sibling button that never opens the artifact', async () => {
    const onSelect = vi.fn();
    render(<ArtifactList artifacts={ARTIFACTS} onSelect={onSelect} />);

    const remove = screen.getByRole('button', {
      name: deleteLabel('Mitosis'),
    });
    expect(openButton('Mitosis')).not.toContainElement(remove);

    await userEvent.click(remove);

    expect(deleteArtifact).toHaveBeenCalledWith('a2');
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('withholds delete from a read-only viewer', () => {
    render(<ArtifactList artifacts={ARTIFACTS} readOnly onSelect={vi.fn()} />);

    expect(
      screen.queryByRole('button', { name: deleteLabel('Mitosis') })
    ).toBeNull();
    expect(openButton('Mitosis')).toBeInTheDocument();
  });
});
