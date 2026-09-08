import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Artifact } from '@knowtis/shared-types';

import { StudyToolsTab } from './StudyToolsTab';

interface ListProps {
  noteId?: string;
  artifacts?: Artifact[];
  readOnly?: boolean;
  onSelect: (artifact: Artifact) => void;
}

interface ViewerProps {
  artifact: Artifact;
  readOnly?: boolean;
}

const { artifacts, listProps, viewerProps } = vi.hoisted(() => ({
  artifacts: [
    {
      id: 'a1',
      userId: 'u1',
      sourceNoteId: 'note-1',
      title: 'Key ideas',
      createdAt: '2026-09-01T00:00:00.000Z',
      updatedAt: '2026-09-01T00:00:00.000Z',
      type: 'summary',
      content: { summary: 'body', keyPoints: [] },
    },
    {
      id: 'a2',
      userId: 'u1',
      sourceNoteId: 'note-1',
      title: 'Practice quiz',
      createdAt: '2026-09-02T00:00:00.000Z',
      updatedAt: '2026-09-02T00:00:00.000Z',
      type: 'quiz',
      content: { questions: [] },
    },
  ] as Artifact[],
  listProps: { last: undefined as ListProps | undefined },
  viewerProps: { last: undefined as ViewerProps | undefined },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('./ArtifactGenerator', () => ({
  ArtifactGeneratorButton: () => <button type="button">Generate</button>,
}));

vi.mock('./ArtifactList', () => ({
  ArtifactList: (props: ListProps) => {
    listProps.last = props;
    return (
      <button type="button" onClick={() => props.onSelect(artifacts[0])}>
        Open artifact
      </button>
    );
  },
}));

vi.mock('./ArtifactViewer', () => ({
  ArtifactViewer: (props: ViewerProps) => {
    viewerProps.last = props;
    return <div data-testid="artifact-viewer">{props.artifact.title}</div>;
  },
}));

const generatorButton = () =>
  screen.queryByRole('button', { name: 'Generate' });

beforeEach(() => {
  listProps.last = undefined;
  viewerProps.last = undefined;
});

describe('StudyToolsTab', () => {
  describe('for a shared-note visitor', () => {
    it('hands the list its artifacts read-only and never fetches by note', () => {
      render(
        <StudyToolsTab noteId="note-1" artifacts={artifacts} readOnly={true} />
      );

      expect(generatorButton()).toBeNull();
      expect(listProps.last?.artifacts).toEqual(artifacts);
      expect(listProps.last?.readOnly).toBe(true);
      expect(listProps.last).not.toHaveProperty('noteId');
    });

    it('opens the selected artifact read-only', async () => {
      render(
        <StudyToolsTab noteId="note-1" artifacts={artifacts} readOnly={true} />
      );

      await userEvent.click(
        screen.getByRole('button', { name: 'Open artifact' })
      );

      expect(screen.getByTestId('artifact-viewer')).toHaveTextContent(
        'Key ideas'
      );
      expect(viewerProps.last?.artifact).toEqual(artifacts[0]);
      expect(viewerProps.last?.readOnly).toBe(true);
    });

    it('labels the way back out of a selected artifact', async () => {
      render(
        <StudyToolsTab noteId="note-1" artifacts={artifacts} readOnly={true} />
      );

      await userEvent.click(
        screen.getByRole('button', { name: 'Open artifact' })
      );

      expect(
        screen.getByRole('button', { name: 'ai.artifacts.back' })
      ).toBeInTheDocument();
    });
  });

  describe('for the note owner', () => {
    it('offers the generator and lets the list fetch by note', () => {
      render(<StudyToolsTab noteId="note-1" />);

      expect(generatorButton()).toBeInTheDocument();
      expect(listProps.last?.noteId).toBe('note-1');
      expect(listProps.last?.artifacts).toBeUndefined();
      expect(listProps.last?.readOnly).toBe(false);
    });
  });

  it('asks for a note when there is none', () => {
    render(<StudyToolsTab noteId={null} />);

    expect(screen.getByText('ai.copilot.estudio.noNote')).toBeInTheDocument();
    expect(listProps.last).toBeUndefined();
  });
});
