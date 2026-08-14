import type { ReactNode } from 'react';

import {
  QueryClient,
  QueryClientProvider,
  useQuery,
} from '@tanstack/react-query';

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type * as DataAccessNotes from '@knowtis/data-access-notes';
import { notesQueryKeys } from '@knowtis/data-access-notes';
import { TooltipProvider } from '@knowtis/design-system';

import { ShareDialog } from './ShareDialog';

const updateMutate =
  vi.fn<
    (
      vars: unknown,
      handlers?: { onSuccess?: () => void; onError?: () => void }
    ) => void
  >();
const toastSuccess = vi.fn();
const toastError = vi.fn();

vi.mock('@knowtis/data-access-notes', async (importOriginal) => ({
  ...(await importOriginal<typeof DataAccessNotes>()),
  useUpdateNote: () => ({ mutate: updateMutate, isPending: false }),
}));
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
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>{children}</TooltipProvider>
  </QueryClientProvider>
);

function DetailObserver() {
  useQuery({
    queryKey: notesQueryKeys.detail('n1'),
    queryFn: () => new Promise(() => undefined),
  });
  return null;
}

function renderDialog(overrides: Partial<Parameters<typeof ShareDialog>[0]>) {
  return render(
    <ShareDialog
      open
      onOpenChange={vi.fn()}
      noteId="n1"
      noteTitle="Note"
      generalAccess="restricted"
      generalAccessPermission="viewer"
      shareToken={null}
      editorsCanShare={false}
      accessLevel="owner"
      {...overrides}
    />,
    { wrapper }
  );
}

const clickOption = (name: string) =>
  userEvent.click(screen.getByRole('button', { name: new RegExp(name) }));

const settle = (result: 'onSuccess' | 'onError' = 'onSuccess') =>
  updateMutate.mock.calls.at(-1)?.[1]?.[result]?.();

describe('ShareDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = new QueryClient();
  });

  it('announces a first share as a created link', async () => {
    renderDialog({ shareToken: null });

    await clickOption('share.anyoneWithLink');
    settle();

    expect(toastSuccess).toHaveBeenCalledWith('share.linkCreatedToast');
  });

  it('announces a share as resumed when the note already holds a token', async () => {
    renderDialog({ shareToken: 'tok', generalAccess: 'restricted' });

    await clickOption('share.anyoneWithLink');
    settle();

    expect(toastSuccess).toHaveBeenCalledWith('share.linkResumedToast');
  });

  it('announces going private as a paused link', async () => {
    renderDialog({ shareToken: 'tok', generalAccess: 'anyone_with_link' });

    await clickOption('share.restricted');
    settle();

    expect(toastSuccess).toHaveBeenCalledWith('share.linkPausedToast');
  });

  it('reports a failed access change instead of staying silent', async () => {
    renderDialog({ shareToken: 'tok', generalAccess: 'anyone_with_link' });

    await clickOption('share.restricted');
    settle('onError');

    expect(toastError).toHaveBeenCalledWith('share.accessChangeError');
    expect(toastSuccess).not.toHaveBeenCalled();
  });

  it('ignores a click on the access level already in effect', async () => {
    renderDialog({ generalAccess: 'restricted' });

    await clickOption('share.restricted');

    expect(updateMutate).not.toHaveBeenCalled();
    expect(toastSuccess).not.toHaveBeenCalled();
  });

  it('describes a private note without a link as having no link at all', async () => {
    renderDialog({ shareToken: null, generalAccess: 'restricted' });

    expect(await screen.findByText('share.restrictedDesc')).toBeInTheDocument();
    expect(screen.queryByText('share.restrictedDescPaused')).toBeNull();
  });

  it('describes a private note that kept its token as paused', async () => {
    renderDialog({ shareToken: 'tok', generalAccess: 'restricted' });

    expect(
      await screen.findByText('share.restrictedDescPaused')
    ).toBeInTheDocument();
  });

  it('confirms a permission change on the link', async () => {
    renderDialog({ shareToken: 'tok', generalAccess: 'anyone_with_link' });

    await userEvent.click(screen.getByRole('button', { name: 'share.editor' }));
    settle();

    expect(toastSuccess).toHaveBeenCalledWith('share.permissionEditorToast');
  });

  it('refreshes the note detail when the dialog opens', async () => {
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    renderDialog({ shareToken: 'tok' });

    await waitFor(() =>
      expect(invalidate).toHaveBeenCalledWith({
        queryKey: ['notes', 'detail', 'n1'],
      })
    );
  });

  it('leaves a closed dialog alone', () => {
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    renderDialog({ open: false, shareToken: 'tok' });

    expect(invalidate).not.toHaveBeenCalled();
  });

  it('refuses to act on sharing state that is still being refreshed', async () => {
    render(
      <>
        <DetailObserver />
        <ShareDialog
          open
          onOpenChange={vi.fn()}
          noteId="n1"
          noteTitle="Note"
          generalAccess="anyone_with_link"
          generalAccessPermission="viewer"
          shareToken="tok"
          editorsCanShare={false}
          accessLevel="owner"
        />
      </>,
      { wrapper }
    );

    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: /share.restricted/ })
      ).toBeDisabled()
    );

    await clickOption('share.restricted');
    expect(updateMutate).not.toHaveBeenCalled();
  });
});
