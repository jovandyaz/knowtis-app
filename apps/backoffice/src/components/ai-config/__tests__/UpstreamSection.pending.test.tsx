import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { httpClient } from '@knowtis/api-client';
import type { AiConfigEntry } from '@knowtis/data-access-admin';

import { UpstreamSection } from '../UpstreamSection';

const ENTRY: AiConfigEntry = {
  key: 'ai_openrouter_ignored_providers',
  value: 'parasail',
  kind: 'list',
  source: 'custom',
  storedValue: null,
  description: null,
  updatedAt: null,
};

const RESET_NAME = /reset to default: ignored providers/i;

afterEach(() => {
  vi.restoreAllMocks();
});

describe('UpstreamSection pending mutations', () => {
  it.each([
    ['Save', 'Save', 'success'],
    ['Save', 'Reset', 'success'],
    ['Reset', 'Save', 'success'],
    ['Reset', 'Reset', 'success'],
    ['Save', 'Save', 'error'],
    ['Save', 'Reset', 'error'],
    ['Reset', 'Save', 'error'],
    ['Reset', 'Reset', 'error'],
  ] as const)(
    'prevents a same-tick %s/%s race and releases after %s',
    async (first, second, outcome) => {
      const pending = Promise.withResolvers<undefined>();
      const put = vi.spyOn(httpClient, 'put').mockReturnValue(pending.promise);
      const remove = vi
        .spyOn(httpClient, 'delete')
        .mockReturnValue(pending.promise);
      const client = new QueryClient({
        defaultOptions: {
          queries: { retry: false },
          mutations: { retry: false },
        },
      });
      const { unmount } = render(
        <QueryClientProvider client={client}>
          <UpstreamSection mode="ignore" entry={ENTRY} />
        </QueryClientProvider>
      );
      await userEvent.type(
        screen.getByRole('textbox', { name: 'Ignored providers' }),
        ',fireworks'
      );
      const save = screen.getByRole('button', { name: 'Save' });
      const reset = screen.getByRole('button', { name: RESET_NAME });
      const buttons = { Save: save, Reset: reset };

      try {
        act(() => {
          fireEvent.click(buttons[first]);
          fireEvent.click(buttons[second]);
        });
        await waitFor(() => expect(save).toBeDisabled());
        expect(reset).toBeDisabled();
        if (first === 'Save') {
          expect(put).toHaveBeenCalledExactlyOnceWith(
            '/ai/config/ai_openrouter_ignored_providers',
            { value: 'parasail,fireworks' }
          );
          expect(remove).not.toHaveBeenCalled();
        } else {
          expect(remove).toHaveBeenCalledExactlyOnceWith(
            '/ai/config/ai_openrouter_ignored_providers'
          );
          expect(put).not.toHaveBeenCalled();
        }

        await act(async () => {
          if (outcome === 'success') {
            pending.resolve(undefined);
          } else {
            pending.reject(new Error('Write failed'));
          }
        });
        await waitFor(() => expect(reset).toBeEnabled());
        put.mockResolvedValue(undefined);
        remove.mockResolvedValue(undefined);
        const previousDeletes = remove.mock.calls.length;
        act(() => {
          fireEvent.click(reset);
          fireEvent.click(reset);
        });
        await waitFor(() =>
          expect(remove).toHaveBeenCalledTimes(previousDeletes + 1)
        );
        await waitFor(() => expect(reset).toBeEnabled());
      } finally {
        await act(async () => {
          pending.resolve(undefined);
          await pending.promise.catch(() => undefined);
        });
        unmount();
        client.clear();
      }
    }
  );
});
