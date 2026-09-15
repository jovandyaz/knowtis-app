import { useState } from 'react';

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Artifact } from '@knowtis/shared-types';

import { ARTIFACT_ROW_ID_ATTRIBUTE } from './artifact-row';
import type * as StudyFocusSessionModule from './focus/StudyFocusSession';
import { StudyToolsTab } from './StudyToolsTab';

interface ListProps {
  noteId?: string;
  artifacts?: Artifact[];
  readOnly?: boolean;
  onSelect: (artifact: Artifact) => void;
}

interface ViewerProps {
  artifact: Artifact;
}

interface FocusSessionProps {
  artifact: Artifact;
  readOnly?: boolean;
  onClose: () => void;
}

const { artifacts, listProps, viewerProps, focusProps, useArtifacts } =
  vi.hoisted(() => {
    const artifacts = [
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
    ] as Artifact[];
    return {
      artifacts,
      listProps: { last: undefined as ListProps | undefined },
      viewerProps: { last: undefined as ViewerProps | undefined },
      focusProps: { last: undefined as FocusSessionProps | undefined },
      useArtifacts: vi.fn((noteId?: string) => ({
        data: noteId ? artifacts : undefined,
      })),
    };
  });

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('@knowtis/data-access-artifacts', () => ({ useArtifacts }));

vi.mock('./ArtifactGenerator', () => ({
  ArtifactGeneratorButton: () => <button type="button">Generate</button>,
}));

vi.mock('./ArtifactList', () => ({
  ArtifactList: (props: ListProps) => {
    listProps.last = props;
    return (
      <button
        type="button"
        {...{ [ARTIFACT_ROW_ID_ATTRIBUTE]: artifacts[1].id }}
        onClick={() => props.onSelect(artifacts[1])}
      >
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

vi.mock('./focus/StudyFocusSession', async (importOriginal) => {
  const actual = await importOriginal<typeof StudyFocusSessionModule>();
  return {
    ...actual,
    StudyFocusSession: (props: FocusSessionProps) => {
      focusProps.last = props;
      return (
        <div data-testid="focus-session">
          <button type="button" onClick={props.onClose}>
            Exit focus
          </button>
        </div>
      );
    },
  };
});

const onSelectArtifact = vi.fn();

const selection = (selectedArtifactId: string | null = null) => ({
  selectedArtifactId,
  onSelectArtifact,
});

const generatorButton = () =>
  screen.queryByRole('button', { name: 'Generate' });
const openArtifactButton = () =>
  screen.queryByRole('button', { name: 'Open artifact' });

beforeEach(() => {
  vi.clearAllMocks();
  listProps.last = undefined;
  viewerProps.last = undefined;
  focusProps.last = undefined;
});

describe('StudyToolsTab', () => {
  it('restores focus to the selected artifact row after closing focus mode', async () => {
    function ControlledTab() {
      const [selectedArtifactId, onSelectArtifact] = useState<string | null>(
        null
      );
      return (
        <StudyToolsTab
          noteId="note-1"
          selectedArtifactId={selectedArtifactId}
          onSelectArtifact={onSelectArtifact}
        />
      );
    }
    render(<ControlledTab />);
    await userEvent.click(
      screen.getByRole('button', { name: 'Open artifact' })
    );
    await userEvent.click(screen.getByRole('button', { name: 'Exit focus' }));
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Open artifact' })
      ).toHaveFocus()
    );
  });
  describe('for a shared-note visitor', () => {
    it('hands the list its artifacts read-only and never fetches by note', () => {
      render(
        <StudyToolsTab
          noteId="note-1"
          artifacts={artifacts}
          readOnly={true}
          {...selection()}
        />
      );

      expect(generatorButton()).toBeNull();
      expect(listProps.last?.artifacts).toEqual(artifacts);
      expect(listProps.last?.readOnly).toBe(true);
      expect(listProps.last).not.toHaveProperty('noteId');
      expect(useArtifacts).not.toHaveBeenCalledWith('note-1');
    });

    it('reports the picked artifact instead of opening it locally', async () => {
      render(
        <StudyToolsTab
          noteId="note-1"
          artifacts={artifacts}
          readOnly={true}
          {...selection()}
        />
      );

      await userEvent.click(
        screen.getByRole('button', { name: 'Open artifact' })
      );

      expect(onSelectArtifact).toHaveBeenCalledWith('a2');
      expect(screen.queryByTestId('focus-session')).toBeNull();
    });

    it('opens a selected quiz read-only in the focus session over the list', () => {
      render(
        <StudyToolsTab
          noteId="note-1"
          artifacts={artifacts}
          readOnly={true}
          {...selection('a2')}
        />
      );

      expect(screen.getByTestId('focus-session')).toBeInTheDocument();
      expect(openArtifactButton()).toBeInTheDocument();
      expect(focusProps.last?.artifact).toEqual(artifacts[1]);
      expect(focusProps.last?.readOnly).toBe(true);
    });

    it('clears the selection when the focus session closes', async () => {
      render(
        <StudyToolsTab
          noteId="note-1"
          artifacts={artifacts}
          readOnly={true}
          {...selection('a2')}
        />
      );

      await userEvent.click(screen.getByRole('button', { name: 'Exit focus' }));

      expect(onSelectArtifact).toHaveBeenCalledWith(null);
    });

    it('shows a selected summary inline with a labelled way back', async () => {
      render(
        <StudyToolsTab
          noteId="note-1"
          artifacts={artifacts}
          readOnly={true}
          {...selection('a1')}
        />
      );

      expect(screen.getByTestId('artifact-viewer')).toHaveTextContent(
        'Key ideas'
      );
      expect(viewerProps.last?.artifact).toEqual(artifacts[0]);
      expect(openArtifactButton()).toBeNull();

      await userEvent.click(
        screen.getByRole('button', { name: 'ai.artifacts.back' })
      );

      expect(onSelectArtifact).toHaveBeenCalledWith(null);
    });

    it('falls back to the list when the selected artifact is unknown', () => {
      render(
        <StudyToolsTab
          noteId="note-1"
          artifacts={artifacts}
          readOnly={true}
          {...selection('missing')}
        />
      );

      expect(openArtifactButton()).toBeInTheDocument();
      expect(screen.queryByTestId('focus-session')).toBeNull();
      expect(screen.queryByTestId('artifact-viewer')).toBeNull();
    });
  });

  describe('for the note owner', () => {
    it('offers the generator and lets the list fetch by note', () => {
      render(<StudyToolsTab noteId="note-1" {...selection()} />);

      expect(generatorButton()).toBeInTheDocument();
      expect(listProps.last?.noteId).toBe('note-1');
      expect(listProps.last?.artifacts).toBeUndefined();
      expect(listProps.last?.readOnly).toBe(false);
    });

    it("resolves the selected quiz from the note's artifacts", () => {
      render(<StudyToolsTab noteId="note-1" {...selection('a2')} />);

      expect(useArtifacts).toHaveBeenCalledWith('note-1');
      expect(focusProps.last?.artifact).toEqual(artifacts[1]);
      expect(focusProps.last?.readOnly).toBe(false);
    });
  });

  it('asks for a note when there is none', () => {
    render(<StudyToolsTab noteId={null} {...selection()} />);

    expect(screen.getByText('ai.copilot.study.noNote')).toBeInTheDocument();
    expect(listProps.last).toBeUndefined();
  });

  it('rejects illegal prop combinations (asserted by typecheck, not at runtime)', () => {
    const sel = selection();
    const artifactsWithoutReadOnly = (
      // @ts-expect-error - injected artifacts without readOnly must not compile
      <StudyToolsTab noteId="note-1" artifacts={artifacts} {...sel} />
    );
    const readOnlyWithoutArtifacts = (
      // @ts-expect-error - readOnly without injected artifacts must not compile
      <StudyToolsTab noteId="n" readOnly {...sel} />
    );

    expect(artifactsWithoutReadOnly).toBeDefined();
    expect(readOnlyWithoutArtifacts).toBeDefined();
  });
});
