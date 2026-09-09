import {
  act,
  cleanup,
  fireEvent,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'sonner';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiClientError, notesApi } from '@knowtis/api-client';
import type * as ApiClient from '@knowtis/api-client';
import { notesQueryKeys } from '@knowtis/data-access-notes';

import { useVerifyEmailStore } from '../../stores/verify-email.store';
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
    },
  };
});
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(notesApi.getById).mockResolvedValue(SHARE_NOTE);
  vi.mocked(notesApi.getPeople).mockResolvedValue([
    SHARE_OWNER,
    SHARE_EDITOR,
    SHARE_VIEWER,
  ]);
  vi.mocked(notesApi.update).mockResolvedValue(SHARE_NOTE);
  useVerifyEmailStore.setState({ isOpen: false });
});
afterEach(cleanup);

describe('ShareDialog authority', () => {
  it('identifies malformed access information without exposing the response', async () => {
    vi.mocked(notesApi.getPeople).mockResolvedValue([
      { ...SHARE_OWNER, user: { ...SHARE_OWNER.user, id: 'malformed' } },
    ]);
    shareHarness().render();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Access information could not be validated.'
    );
    expect(screen.getByRole('button', { name: 'Add person' })).toBeDisabled();
  });

  it.each<[string, unknown]>([
    ['null', null],
    ['string policy', { ...SHARE_NOTE, editorsCanShare: 'false' }],
  ])(
    'rejects %s authority without enabling a direct editor and recovers on retry',
    async (_label, response) => {
      vi.mocked(notesApi.getById)
        .mockResolvedValueOnce(response as typeof SHARE_NOTE)
        .mockResolvedValue({ ...SHARE_NOTE, accessLevel: 'editor' });
      shareHarness({ actor: SHARE_EDITOR }).render();
      expect(await screen.findByRole('alert')).toHaveTextContent(
        'Access information could not be validated.'
      );
      expect(screen.getByRole('button', { name: 'Add person' })).toBeDisabled();
      expect(
        screen.getByRole('radio', { name: /Anyone with the link/ })
      ).toBeDisabled();
      expect(
        screen.queryByText(SHARE_VIEWER.user.email)
      ).not.toBeInTheDocument();
      expect(notesApi.update).not.toHaveBeenCalled();
      await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
      await waitForPeople();
      expect(
        screen.getByRole('listitem', { name: SHARE_VIEWER.user.email })
      ).toBeInTheDocument();
      expect(
        screen.getByRole('radio', { name: /Anyone with the link/ })
      ).toBeDisabled();
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    }
  );

  it('gives the copy link icon an accessible action name', async () => {
    vi.mocked(notesApi.getById).mockResolvedValue({
      ...SHARE_NOTE,
      generalAccess: 'anyone_with_link',
      shareToken: 'tok',
    });
    shareHarness().render();
    await waitForPeople();
    expect(screen.getByRole('button', { name: 'Copy link' })).toBeEnabled();
  });

  it.each([
    {
      generalAccess: 'restricted' as const,
      shareToken: null,
      option: /Anyone with the link/,
      message: "Link created. It's ready to share",
    },
    {
      generalAccess: 'anyone_with_link' as const,
      shareToken: 'tok',
      option: /Private/,
      message: 'Link paused. It stops working until you share again',
    },
  ])(
    'confirms persisted link changes for $generalAccess',
    async ({ generalAccess, shareToken, option, message }) => {
      vi.mocked(notesApi.getById).mockResolvedValue({
        ...SHARE_NOTE,
        generalAccess,
        shareToken,
      });
      shareHarness().render();
      await waitForPeople();
      await userEvent.click(screen.getByRole('radio', { name: option }));
      await waitFor(() => expect(toast.success).toHaveBeenCalledWith(message));
    }
  );

  it('does not write an already selected link permission', async () => {
    vi.mocked(notesApi.getById).mockResolvedValue({
      ...SHARE_NOTE,
      generalAccess: 'anyone_with_link',
      shareToken: 'tok',
    });
    shareHarness().render();
    await waitForPeople();
    await userEvent.click(
      within(screen.getByRole('radiogroup', { name: 'Link access' })).getByRole(
        'radio',
        { name: 'Viewer' }
      )
    );
    expect(notesApi.update).not.toHaveBeenCalled();
  });

  it('discards pre-write reads and waits for fresh authority and people after changing policy', async () => {
    const patch = deferred<typeof SHARE_NOTE>();
    const oldAuthority = deferred<typeof SHARE_NOTE>();
    const freshAuthority = deferred<typeof SHARE_NOTE>();
    const oldPeople = deferred<(typeof SHARE_OWNER)[]>();
    const freshPeople = deferred<(typeof SHARE_OWNER)[]>();
    const savedNote = { ...SHARE_NOTE, editorsCanShare: false };
    const savedPeople = [
      SHARE_OWNER,
      SHARE_EDITOR,
      { ...SHARE_VIEWER, permission: 'editor' as const },
    ];
    const harness = shareHarness();
    harness.render();
    await waitForPeople();
    vi.mocked(notesApi.update).mockReturnValue(patch.promise);
    vi.mocked(notesApi.getById)
      .mockReturnValueOnce(oldAuthority.promise)
      .mockReturnValue(freshAuthority.promise);
    vi.mocked(notesApi.getPeople)
      .mockReturnValueOnce(oldPeople.promise)
      .mockReturnValue(freshPeople.promise);

    await userEvent.click(
      screen.getByRole('switch', { name: 'Editors can share' })
    );
    await waitFor(() => expect(notesApi.update).toHaveBeenCalledTimes(1));
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

    await act(async () => patch.resolve(savedNote));
    await waitFor(() => {
      expect(notesApi.getById).toHaveBeenCalledTimes(3);
      expect(notesApi.getPeople).toHaveBeenCalledTimes(3);
    });
    expect(screen.getByRole('button', { name: 'Add person' })).toBeDisabled();
    await act(async () => freshAuthority.resolve(savedNote));
    await waitFor(() =>
      expect(
        screen.getByRole('switch', { name: 'Editors can share' })
      ).not.toBeChecked()
    );
    expect(screen.getByRole('button', { name: 'Add person' })).toBeDisabled();
    await act(async () => freshPeople.resolve(savedPeople));
    await waitForPeople();
    expect(
      within(
        screen.getByRole('listitem', { name: SHARE_VIEWER.user.email })
      ).getByRole('radio', { name: 'Editor' })
    ).toBeChecked();

    // A transport that cannot abort may still finish; its obsolete result is ignored.
    await act(async () => {
      oldAuthority.resolve(SHARE_NOTE);
      oldPeople.resolve([SHARE_OWNER, SHARE_EDITOR, SHARE_VIEWER]);
    });
    expect(
      screen.getByRole('switch', { name: 'Editors can share' })
    ).not.toBeChecked();
    expect(
      harness.client.getQueryData(notesQueryKeys.people(SHARE_NOTE.id))
    ).toEqual(savedPeople);
    expect(screen.getByRole('button', { name: 'Add person' })).toBeEnabled();
  });

  it('reports a failed link change with localized generic copy', async () => {
    vi.mocked(notesApi.update).mockRejectedValue(
      new Error('private server detail')
    );
    shareHarness().render();
    await waitForPeople();
    await userEvent.click(
      screen.getByRole('radio', { name: /Anyone with the link/ })
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      "Couldn't change access. Try again"
    );
    expect(screen.queryByText('private server detail')).not.toBeInTheDocument();
  });

  it('withholds a copyable link while the authority read is failing', async () => {
    vi.mocked(notesApi.getById).mockRejectedValue(new Error('offline'));
    shareHarness().render({
      generalAccess: 'anyone_with_link',
      shareToken: 'stale-token',
    });
    await screen.findByRole('alert');
    expect(
      screen.queryByRole('button', { name: 'Copy link' })
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/stale-token/)).not.toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /Private/ })).toBeChecked();
  });

  it('uses a freshly absent share token instead of a stale prop token', async () => {
    shareHarness().render({ shareToken: 'outdated-token' });
    await waitForPeople();
    expect(
      screen.getByRole('radio', { name: /Private/ })
    ).not.toHaveTextContent('paused');
  });

  it('refreshes both reads and blocks all mutations until both finish', async () => {
    const detail = deferred<typeof SHARE_NOTE>();
    vi.mocked(notesApi.getById).mockReturnValue(detail.promise);
    const harness = shareHarness();
    harness.client.setQueryData(notesQueryKeys.detail('n1'), SHARE_NOTE);
    harness.client.setQueryData(notesQueryKeys.people('n1'), [
      SHARE_OWNER,
      SHARE_EDITOR,
    ]);
    harness.render();
    expect(
      screen.getByRole('radio', { name: /Anyone with the link/ })
    ).toBeDisabled();
    await waitFor(() => expect(notesApi.getPeople).toHaveBeenCalled());
    expect(screen.getByRole('button', { name: 'Add person' })).toBeDisabled();
    await act(async () => detail.resolve(SHARE_NOTE));
    await waitForPeople();
  });

  it('fails closed on a detail refresh error and retries visibly', async () => {
    vi.mocked(notesApi.getById)
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue(SHARE_NOTE);
    const harness = shareHarness();
    harness.client.setQueryData(notesQueryKeys.detail('n1'), SHARE_NOTE);
    harness.render();
    await screen.findByRole('alert');
    expect(
      screen.getByRole('radio', { name: /Anyone with the link/ })
    ).toBeDisabled();
    expect(screen.queryByText(SHARE_VIEWER.user.email)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await waitForPeople();
  });

  it('hides cached recipients on a refused People refresh', async () => {
    vi.mocked(notesApi.getPeople).mockRejectedValue(
      new ApiClientError('private info', 403)
    );
    const harness = shareHarness();
    harness.client.setQueryData(notesQueryKeys.people('n1'), [
      SHARE_OWNER,
      SHARE_VIEWER,
    ]);
    harness.render();
    expect(await screen.findByRole('alert')).not.toHaveTextContent(
      'private info'
    );
    expect(screen.queryByText(SHARE_VIEWER.user.email)).not.toBeInTheDocument();
    expect(
      screen.getByRole('radio', { name: /Anyone with the link/ })
    ).toBeDisabled();
  });

  it('allows a direct editor to manage others while keeping owner and self immutable', async () => {
    vi.mocked(notesApi.getById).mockResolvedValue({
      ...SHARE_NOTE,
      accessLevel: 'editor',
    });
    shareHarness({ actor: SHARE_EDITOR }).render();
    await waitForPeople();
    expect(
      screen.getByRole('radio', { name: /Anyone with the link/ })
    ).toBeDisabled();
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
    for (const person of [SHARE_OWNER, SHARE_EDITOR]) {
      const row = screen.getByRole('listitem', { name: person.user.email });
      expect(within(row).queryByRole('radiogroup')).not.toBeInTheDocument();
      expect(within(row).queryByRole('button')).not.toBeInTheDocument();
    }
    expect(
      within(
        screen.getByRole('listitem', { name: SHARE_VIEWER.user.email })
      ).getByRole('button', { name: 'Remove Viewer' })
    ).toBeEnabled();
  });

  it('does not infer People management from link editor effective access', async () => {
    vi.mocked(notesApi.getById).mockResolvedValue({
      ...SHARE_NOTE,
      accessLevel: 'editor',
    });
    vi.mocked(notesApi.getPeople).mockResolvedValue([
      SHARE_OWNER,
      SHARE_VIEWER,
    ]);
    shareHarness({ actor: SHARE_EDITOR }).render();
    await waitFor(() => expect(notesApi.getPeople).toHaveBeenCalled());
    await screen.findByText('You cannot manage people for this note.');
    expect(screen.getByRole('button', { name: 'Add person' })).toBeDisabled();
    expect(
      screen.getByRole('radio', { name: /Anyone with the link/ })
    ).toBeDisabled();
  });

  it('routes an actual widening refusal to verification while narrowing stays available', async () => {
    vi.mocked(notesApi.update).mockRejectedValueOnce(
      new ApiClientError('verify', 403, 'EMAIL_NOT_VERIFIED')
    );
    shareHarness().render();
    await waitForPeople();
    await userEvent.click(
      screen.getByRole('radio', { name: /Anyone with the link/ })
    );
    await waitFor(() =>
      expect(useVerifyEmailStore.getState().isOpen).toBe(true)
    );
    await waitForPeople();
    expect(
      screen.getByRole('switch', { name: 'Editors can share' })
    ).toBeEnabled();
  });

  it('synchronously serializes link and policy changes before pending renders', async () => {
    const mutation = deferred<typeof SHARE_NOTE>();
    vi.mocked(notesApi.update).mockReturnValue(mutation.promise);
    shareHarness().render();
    await waitForPeople();
    act(() => {
      fireEvent.click(
        screen.getByRole('radio', { name: /Anyone with the link/ })
      );
      fireEvent.click(
        screen.getByRole('switch', { name: 'Editors can share' })
      );
    });
    await waitFor(() => expect(notesApi.update).toHaveBeenCalledTimes(1));
    await act(async () => mutation.resolve(SHARE_NOTE));
  });

  it('does not fetch while closed and refreshes both reads on reopening', async () => {
    const harness = shareHarness();
    const view = harness.render({ open: false });
    expect(notesApi.getById).not.toHaveBeenCalled();
    expect(notesApi.getPeople).not.toHaveBeenCalled();
    view.rerender(harness.dialog());
    await waitForPeople();
    view.rerender(harness.dialog({ open: false }));
    view.rerender(harness.dialog());
    await waitForPeople();
    expect(notesApi.getById).toHaveBeenCalledTimes(2);
    expect(notesApi.getPeople).toHaveBeenCalledTimes(2);
  });
});
