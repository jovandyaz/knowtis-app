import type { ReactNode } from 'react';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { useArtifactSidebarStore } from '@/stores/artifact-sidebar.store';
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
      getByNote: vi.fn().mockResolvedValue([]),
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

describe('ArtifactGeneratorDialog — feedback outlives the dialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = new QueryClient({
      defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
    });
    useArtifactSidebarStore.setState({ generatorOpen: true });
  });

  it('confirms a generation that finishes after the note is gone', async () => {
    let settle: (() => void) | undefined;
    vi.mocked(artifactsApi.generate).mockReturnValue(
      new Promise((resolve) => {
        settle = () =>
          resolve({
            id: 'a1',
            sourceNoteId: 'n1',
            type: 'summary',
          } as Awaited<ReturnType<typeof artifactsApi.generate>>);
      })
    );

    const { unmount } = render(<ArtifactGeneratorDialog noteId="n1" />, {
      wrapper,
    });

    await userEvent.click(
      screen.getByRole('button', { name: /ai.artifacts.generate.summary/ })
    );
    await waitFor(() => expect(artifactsApi.generate).toHaveBeenCalled());

    unmount();
    settle?.();

    await waitFor(() =>
      expect(toastSuccess).toHaveBeenCalledWith('ai.artifacts.generate.success')
    );
  });

  it('reports a generation that fails after the note is gone', async () => {
    let fail: (() => void) | undefined;
    vi.mocked(artifactsApi.generate).mockReturnValue(
      new Promise((_resolve, reject) => {
        fail = () => reject(new Error('model refused'));
      })
    );

    const { unmount } = render(<ArtifactGeneratorDialog noteId="n1" />, {
      wrapper,
    });

    await userEvent.click(
      screen.getByRole('button', { name: /ai.artifacts.generate.quiz/ })
    );
    await waitFor(() => expect(artifactsApi.generate).toHaveBeenCalled());

    unmount();
    fail?.();

    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith('model refused')
    );
  });
});
