import {
  act,
  cleanup,
  fireEvent,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { notesApi } from '@knowtis/api-client';
import type * as ApiClient from '@knowtis/api-client';
import { notesQueryKeys } from '@knowtis/data-access-notes';

import {
  deferred,
  SHARE_EDITOR,
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
      rotateShareLink: vi.fn(),
    },
  };
});
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const pausedNote = { ...SHARE_NOTE, shareToken: 'old-token' };
const openNote = { ...pausedNote, generalAccess: 'anyone_with_link' as const };
const savedNote = { ...openNote, shareToken: 'winning-token' };

async function openConfirmation() {
  await userEvent.click(
    screen.getByRole('button', { name: 'Change share link' })
  );
  return screen.getByRole('dialog', { name: 'Change this share link?' });
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(notesApi.getById).mockResolvedValue(pausedNote);
  vi.mocked(notesApi.getPeople).mockResolvedValue([
    SHARE_OWNER,
    SHARE_EDITOR,
    SHARE_VIEWER,
  ]);
  vi.mocked(notesApi.rotateShareLink).mockResolvedValue(savedNote);
  vi.mocked(notesApi.update).mockResolvedValue(pausedNote);
});
afterEach(cleanup);

describe('ShareDialog link rotation integration', () => {
  it('offers rotation for a private retained token and restores focus on cancel', async () => {
    shareHarness().render({ shareToken: null });
    await waitForPeople();
    expect(screen.getByRole('radio', { name: /Private/ })).toBeChecked();
    expect(
      screen.queryByRole('button', { name: 'Copy link' })
    ).not.toBeInTheDocument();
    const trigger = screen.getByRole('button', { name: 'Change share link' });
    const confirmation = await openConfirmation();
    expect(confirmation).toHaveTextContent(
      'People added directly keep their permissions.'
    );
    await userEvent.click(
      within(confirmation).getByRole('button', { name: 'Cancel' })
    );
    await waitFor(() => expect(trigger).toHaveFocus());
    expect(notesApi.rotateShareLink).not.toHaveBeenCalled();
  });

  it('hides rotation from a direct editor even when stale props claim ownership', async () => {
    vi.mocked(notesApi.getById).mockResolvedValue({
      ...openNote,
      accessLevel: 'editor',
    });
    shareHarness({ actor: SHARE_EDITOR }).render({
      accessLevel: 'owner',
      shareToken: 'stale-token',
    });
    await waitForPeople();
    expect(
      screen.queryByRole('button', { name: 'Change share link' })
    ).not.toBeInTheDocument();
  });

  it('uses fresh missing-token authority instead of a stale prop or detail cache', async () => {
    vi.mocked(notesApi.getById).mockResolvedValue(SHARE_NOTE);
    const harness = shareHarness();
    harness.client.setQueryData(notesQueryKeys.detail(SHARE_NOTE.id), openNote);
    harness.render({ shareToken: 'stale-token' });
    await waitForPeople();
    expect(
      screen.queryByRole('button', { name: 'Change share link' })
    ).not.toBeInTheDocument();
  });

  it('shares the synchronous mutation lock with policy changes and duplicate native submissions', async () => {
    const mutation = deferred<typeof savedNote>();
    vi.mocked(notesApi.rotateShareLink).mockReturnValue(mutation.promise);
    shareHarness().render();
    await waitForPeople();
    const policySwitch = screen.getByRole('switch', {
      name: 'Editors can share',
    });
    const confirmation = await openConfirmation();
    const form = within(confirmation)
      .getByRole('button', { name: 'Change link' })
      .closest('form');
    if (!form) {
      throw new Error('Expected native rotation form');
    }
    act(() => {
      fireEvent.submit(form);
      fireEvent.click(policySwitch);
      fireEvent.submit(form);
    });
    await waitFor(() =>
      expect(notesApi.rotateShareLink).toHaveBeenCalledTimes(1)
    );
    expect(notesApi.update).not.toHaveBeenCalled();
    expect(
      within(confirmation).getByRole('button', { name: 'Change link' })
    ).toBeDisabled();
    await act(async () => mutation.resolve(savedNote));
    await waitFor(() =>
      expect(
        screen.queryByRole('dialog', { name: 'Change this share link?' })
      ).not.toBeInTheDocument()
    );
  });

  it('discards pre-commit reads and waits for fresh authority and People before showing the winning link', async () => {
    const mutation = deferred<typeof savedNote>();
    const oldAuthority = deferred<typeof openNote>();
    const freshAuthority = deferred<typeof savedNote>();
    const oldPeople = deferred<(typeof SHARE_OWNER)[]>();
    const freshPeople = deferred<(typeof SHARE_OWNER)[]>();
    vi.mocked(notesApi.getById).mockResolvedValue(openNote);
    vi.mocked(notesApi.rotateShareLink).mockReturnValue(mutation.promise);
    const harness = shareHarness();
    harness.render();
    await waitForPeople();
    const confirmation = await openConfirmation();
    vi.mocked(notesApi.getById)
      .mockReturnValueOnce(oldAuthority.promise)
      .mockReturnValue(freshAuthority.promise);
    vi.mocked(notesApi.getPeople)
      .mockReturnValueOnce(oldPeople.promise)
      .mockReturnValue(freshPeople.promise);
    await userEvent.click(
      within(confirmation).getByRole('button', { name: 'Change link' })
    );
    await waitFor(() =>
      expect(notesApi.rotateShareLink).toHaveBeenCalledTimes(1)
    );
    act(() => {
      void harness.client.refetchQueries({
        queryKey: notesQueryKeys.sharingAuthority(SHARE_NOTE.id),
      });
      void harness.client.refetchQueries({
        queryKey: notesQueryKeys.people(SHARE_NOTE.id),
      });
    });
    await waitFor(() => {
      expect(notesApi.getById).toHaveBeenCalledTimes(2);
      expect(notesApi.getPeople).toHaveBeenCalledTimes(2);
    });
    await act(async () => mutation.resolve(savedNote));
    await waitFor(() => {
      expect(notesApi.getById).toHaveBeenCalledTimes(3);
      expect(notesApi.getPeople).toHaveBeenCalledTimes(3);
    });
    expect(
      within(confirmation).getByRole('button', { name: 'Change link' })
    ).toBeDisabled();
    expect(
      harness.client.getQueryData(
        notesQueryKeys.sharingAuthority(SHARE_NOTE.id)
      )
    ).toEqual(openNote);
    await act(async () => freshAuthority.resolve(savedNote));
    expect(confirmation).toBeInTheDocument();
    await act(async () =>
      freshPeople.resolve([SHARE_OWNER, SHARE_EDITOR, SHARE_VIEWER])
    );
    await waitForPeople();
    expect(
      screen.queryByRole('dialog', { name: 'Change this share link?' })
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(`${window.location.origin}/s/winning-token`)
    ).toBeInTheDocument();
    await act(async () => {
      oldAuthority.resolve(openNote);
      oldPeople.resolve([SHARE_OWNER]);
    });
    expect(
      screen.getByText(`${window.location.origin}/s/winning-token`)
    ).toBeInTheDocument();
    expect(screen.getByText(SHARE_VIEWER.user.email)).toBeInTheDocument();
  });

  it('refreshes an uncertain response without retrying and shows the current link after closing', async () => {
    vi.mocked(notesApi.getById)
      .mockResolvedValueOnce(openNote)
      .mockResolvedValue(savedNote);
    vi.mocked(notesApi.rotateShareLink).mockRejectedValue(
      new TypeError('response lost')
    );
    const harness = shareHarness();
    harness.client.setDefaultOptions({
      queries: { retry: false },
      mutations: { retry: 3, retryDelay: 0 },
    });
    harness.render();
    await waitForPeople();
    const confirmation = await openConfirmation();
    await userEvent.click(
      within(confirmation).getByRole('button', { name: 'Change link' })
    );
    expect(await within(confirmation).findByRole('alert')).toHaveTextContent(
      'We could not confirm whether the link changed.'
    );
    expect(notesApi.rotateShareLink).toHaveBeenCalledTimes(1);
    expect(notesApi.getById).toHaveBeenCalledTimes(3);
    expect(
      within(confirmation).queryByRole('button', { name: 'Change link' })
    ).not.toBeInTheDocument();
    await userEvent.click(
      within(confirmation).getAllByRole('button', { name: 'Close' })[0]
    );
    expect(
      screen.getByText(`${window.location.origin}/s/winning-token`)
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Change share link' })
    ).toBeEnabled();
    expect(notesApi.rotateShareLink).toHaveBeenCalledTimes(1);
  });
});
