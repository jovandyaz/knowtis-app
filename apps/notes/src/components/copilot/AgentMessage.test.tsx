import type { ReactElement } from 'react';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import i18n from '@/lib/i18n';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import type * as ApiClient from '@knowtis/api-client';
import { memoriesApi } from '@knowtis/api-client';
import {
  AGENT_STOP_REASON,
  MESSAGE_KIND,
  type ModelCatalogResponse,
} from '@knowtis/shared-types';

import { AgentMessage } from './AgentMessage';

const SUBSTITUTE = 'anthropic:claude-sonnet-5';
const FALLBACK_NOTICE =
  'Answered by Claude Sonnet 5 because the model you picked is no longer available.';
const CATALOG: ModelCatalogResponse = {
  tier: 'byok',
  intents: [],
  models: [
    {
      id: SUBSTITUTE,
      label: 'Claude Sonnet 5',
      descriptionKey: '',
      tier: 'balanced',
      contextWindow: 200_000,
      costClass: 2,
      isDefault: true,
      billedToUser: true,
      routableByServer: false,
    },
  ],
};

vi.mock('@/hooks/useAvailableModels', () => ({
  useAvailableModels: () => ({ data: CATALOG }),
}));
vi.mock('@jovandyaz/auth-react', () => ({
  useAuthUser: () => ({ isAnonymous: false }),
}));
vi.mock('@knowtis/api-client', async (importOriginal) => ({
  ...(await importOriginal<typeof ApiClient>()),
  memoriesApi: { list: vi.fn() },
}));

function followsInDocument(earlier: Node, later: Node): boolean {
  return (
    (earlier.compareDocumentPosition(later) &
      Node.DOCUMENT_POSITION_FOLLOWING) !==
    0
  );
}

describe('AgentMessage', () => {
  beforeAll(async () => {
    await i18n.changeLanguage('en');
  });

  it('shows a continue marker as a chip, never as a bubble', () => {
    render(
      <AgentMessage
        message={{
          id: 'm1',
          turnId: 't2',
          role: 'user',
          content: '',
          kind: MESSAGE_KIND.CONTINUE,
        }}
        isStreaming={false}
      />
    );

    expect(screen.getByText('Continue')).toHaveClass('bg-muted');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('says when a reply was interrupted', () => {
    render(
      <AgentMessage
        message={{
          id: 'm2',
          role: 'assistant',
          content: 'Revisé',
          interrupted: true,
        }}
        isStreaming={false}
      />
    );

    expect(screen.getByRole('status')).toHaveTextContent(
      'This reply was interrupted.'
    );
  });

  it('renders its footer under the answer', () => {
    render(
      <AgentMessage
        message={{
          id: 'm3',
          role: 'assistant',
          content: 'Revisé tres notas.',
          stopReason: AGENT_STOP_REASON.MAX_STEPS,
        }}
        isStreaming={false}
        footer={<button type="button">next</button>}
      />
    );

    expect(screen.getByRole('button', { name: 'next' })).toBeInTheDocument();
  });

  describe('a reply another model answered', () => {
    it('names that model under the reply', () => {
      render(
        <AgentMessage
          message={{
            id: 'm4',
            role: 'assistant',
            content: 'Listo.',
            modelFallback: { reason: 'model_retired', to: SUBSTITUTE },
          }}
          isStreaming={false}
        />
      );

      const notice = screen.getByText(FALLBACK_NOTICE);
      expect(followsInDocument(screen.getByText('Listo.'), notice)).toBe(true);
    });

    it('says nothing about the model of a reply its own model served', () => {
      render(
        <AgentMessage
          message={{ id: 'm5', role: 'assistant', content: 'Listo.' }}
          isStreaming={false}
        />
      );

      expect(screen.queryByText(/^Answered by/)).not.toBeInTheDocument();
    });

    it('names the model before saying how the reply stopped', () => {
      render(
        <AgentMessage
          message={{
            id: 'm6',
            role: 'assistant',
            content: 'Revisé tres notas.',
            stopReason: AGENT_STOP_REASON.MAX_STEPS,
            modelFallback: { reason: 'model_retired', to: SUBSTITUTE },
          }}
          isStreaming={false}
        />
      );

      const stop = screen.getByRole('status');
      expect(stop).toHaveTextContent('The step limit was reached.');
      expect(followsInDocument(screen.getByText(FALLBACK_NOTICE), stop)).toBe(
        true
      );
    });

    it('keeps the interrupted notice beside it', () => {
      render(
        <AgentMessage
          message={{
            id: 'm7',
            role: 'assistant',
            content: 'Revisé',
            interrupted: true,
            modelFallback: { reason: 'model_retired', to: SUBSTITUTE },
          }}
          isStreaming={false}
        />
      );

      expect(screen.getByText(FALLBACK_NOTICE)).toBeInTheDocument();
      expect(screen.getByRole('status')).toHaveTextContent(
        /^This reply was interrupted\.$/
      );
    });
  });

  describe('the memories a reply used', () => {
    function renderWithQueries(ui: ReactElement) {
      const client = new QueryClient({
        defaultOptions: { queries: { retry: false } },
      });
      return render(
        <QueryClientProvider client={client}>{ui}</QueryClientProvider>
      );
    }

    it('counts them under the sources of the answer and lists them on demand', async () => {
      vi.mocked(memoriesApi.list).mockReturnValue(new Promise(() => undefined));
      renderWithQueries(
        <AgentMessage
          message={{
            id: 'm8',
            role: 'assistant',
            content: 'Unas lentejas.',
            webSources: [
              { title: 'MDN', url: 'https://developer.mozilla.org' },
            ],
            usedMemories: [
              { id: 'mem-1', live: { content: 'Soy vegano', receivedAt: 0 } },
              { id: 'mem-2', live: { content: 'Vivo en Lima', receivedAt: 0 } },
            ],
          }}
          isStreaming={false}
        />
      );

      const chip = screen.getByRole('button', { name: 'Used 2 memories' });
      expect(followsInDocument(screen.getByText('Web sources'), chip)).toBe(
        true
      );

      await userEvent.setup().click(chip);

      const dialog = await screen.findByRole('dialog', {
        name: 'Memories used in this answer',
      });
      expect(within(dialog).getByText('Vivo en Lima')).toBeInTheDocument();
    });

    it('shows no memory chip on an answer whose prompt received none', () => {
      renderWithQueries(
        <AgentMessage
          message={{ id: 'm9', role: 'assistant', content: 'Listo.' }}
          isStreaming={false}
        />
      );

      expect(
        screen.queryByRole('button', { name: /memor/i })
      ).not.toBeInTheDocument();
    });
  });
});
