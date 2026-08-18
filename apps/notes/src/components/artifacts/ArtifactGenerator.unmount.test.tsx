import type { ReactNode } from 'react';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { useArtifactSidebarStore } from '@/stores/artifact-sidebar.store';
import { useWorkspaceStore } from '@/stores/workspace.store';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type * as ApiClient from '@knowtis/api-client';
import { artifactsApi } from '@knowtis/api-client';

import { ArtifactGeneratorDialog } from './ArtifactGenerator';

const toastSuccess = vi.fn();
const toastError = vi.fn();

vi.mock('@knowtis/api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof ApiClient>();
  return {
    ...actual,
    artifactsApi: {
      ...actual.artifactsApi,
      generate: vi.fn(),
      getAll: vi.fn().mockResolvedValue([]),
    },
  };
});
vi.mock('sonner', () => ({
  toast: {
    success: (...a: unknown[]) => toastSuccess(...a),
    error: (...a: unknown[]) => toastError(...a),
  },
}));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

let queryClient: QueryClient;

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
);

function pendingGeneration() {
  let settle: (() => void) | undefined;
  let fail: (() => void) | undefined;
  vi.mocked(artifactsApi.generate).mockReturnValue(
    new Promise((resolve, reject) => {
      settle = () =>
        resolve({
          id: 'a1',
          sourceNoteId: 'n1',
          type: 'summary',
        } as Awaited<ReturnType<typeof artifactsApi.generate>>);
      fail = () => reject(new Error('model refused'));
    })
  );
  return {
    settle: () => settle?.(),
    fail: () => fail?.(),
  };
}

async function startGeneration() {
  const pending = pendingGeneration();
  const { unmount } = render(<ArtifactGeneratorDialog noteId="n1" />, {
    wrapper,
  });

  await userEvent.click(
    screen.getByRole('button', { name: /ai.artifacts.generate.summary/ })
  );
  await waitFor(() => expect(artifactsApi.generate).toHaveBeenCalled());

  return { ...pending, unmount };
}

describe('ArtifactGeneratorDialog — feedback outlives the dialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = new QueryClient({
      defaultOptions: {
        mutations: { retry: false },
        queries: { retry: false },
      },
    });
    useArtifactSidebarStore.setState({
      activeNoteId: 'n1',
      generatorOpen: true,
    });
    useWorkspaceStore.setState({ activeTab: 'note' });
  });

  it('confirms a generation that finishes after the note is gone', async () => {
    const { settle, unmount } = await startGeneration();

    unmount();
    useArtifactSidebarStore.getState().setActiveNoteId(null);
    settle();

    await waitFor(() =>
      expect(toastSuccess).toHaveBeenCalledWith('ai.artifacts.generate.success')
    );
  });

  it('reports a generation that fails after the note is gone', async () => {
    const { fail, unmount } = await startGeneration();

    unmount();
    useArtifactSidebarStore.getState().setActiveNoteId(null);
    fail();

    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith('model refused')
    );
  });

  it('closes the dialog and opens study when the note is still the active one', async () => {
    const { settle } = await startGeneration();

    settle();

    await waitFor(() =>
      expect(toastSuccess).toHaveBeenCalledWith('ai.artifacts.generate.success')
    );
    expect(useArtifactSidebarStore.getState().generatorOpen).toBe(false);
    expect(useWorkspaceStore.getState().activeTab).toBe('estudio');
  });

  it('leaves the next note alone when the previous generation lands late', async () => {
    const { settle, unmount } = await startGeneration();

    unmount();
    useArtifactSidebarStore.getState().setActiveNoteId('n2');
    useArtifactSidebarStore.getState().openGenerator();
    settle();

    await waitFor(() =>
      expect(toastSuccess).toHaveBeenCalledWith('ai.artifacts.generate.success')
    );
    expect(useArtifactSidebarStore.getState().generatorOpen).toBe(true);
    expect(useWorkspaceStore.getState().activeTab).toBe('note');
  });
});
