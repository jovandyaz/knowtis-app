import { act, cleanup, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'sonner';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { notesApi } from '@knowtis/api-client';
import type * as ApiClient from '@knowtis/api-client';

import {
  deferred,
  SHARE_NOTE,
  SHARE_OWNER,
  SHARE_VIEWER,
  shareHarness,
  waitForPeople,
} from '../../test/share-harness';

vi.mock('@knowtis/api-client', async (load) => {
  const actual = await load<typeof ApiClient>();
  return {
    ...actual,
    notesApi: {
      ...actual.notesApi,
      getById: vi.fn(),
      getPeople: vi.fn(),
      update: vi.fn(),
      upsertPerson: vi.fn(),
    },
  };
});
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(notesApi.getById).mockResolvedValue({
    ...SHARE_NOTE,
    shareToken: 'tok',
  });
  vi.mocked(notesApi.getPeople).mockResolvedValue([SHARE_OWNER]);
});
afterEach(cleanup);

describe('ShareDialog mutation lifetime', () => {
  it('announces a link change that resolves after unmounting', async () => {
    const save = deferred<typeof SHARE_NOTE>();
    vi.mocked(notesApi.update).mockReturnValue(save.promise);
    const view = shareHarness().render();
    await waitForPeople();
    await userEvent.click(
      screen.getByRole('radio', { name: /Anyone with the link/ })
    );
    await waitFor(() => expect(notesApi.update).toHaveBeenCalledTimes(1));
    view.unmount();
    await act(async () => save.resolve(SHARE_NOTE));
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith(
        "Link active again. It's the same one as before"
      )
    );
  });

  it('keeps the shared action lock while closing and reopening a pending add', async () => {
    const save = deferred<typeof SHARE_VIEWER>();
    vi.mocked(notesApi.upsertPerson).mockReturnValue(save.promise);
    const harness = shareHarness();
    const view = harness.render();
    await waitForPeople();
    await userEvent.type(
      screen.getByRole('textbox', { name: 'Email' }),
      'viewer@example.com'
    );
    await userEvent.click(screen.getByRole('button', { name: 'Add person' }));
    await waitFor(() => expect(notesApi.upsertPerson).toHaveBeenCalledTimes(1));
    view.rerender(harness.dialog({ open: false }));
    view.rerender(harness.dialog());
    await waitFor(() => expect(notesApi.getPeople).toHaveBeenCalledTimes(2));
    expect(screen.getByRole('button', { name: 'Add person' })).toBeDisabled();
    expect(
      screen.getByRole('radio', { name: /Anyone with the link/ })
    ).toBeDisabled();
    await act(async () => save.resolve(SHARE_VIEWER));
    await waitForPeople();
    expect(toast.success).toHaveBeenCalledWith('Permissions saved.');
    expect(notesApi.upsertPerson).toHaveBeenCalledTimes(1);
  });
});
