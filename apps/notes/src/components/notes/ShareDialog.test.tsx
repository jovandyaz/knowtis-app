import type { ReactNode } from 'react';

import {
  QueryClient,
  QueryClientProvider,
  useQuery,
} from '@tanstack/react-query';

import { useVerifyEmailStore } from '@/stores/verify-email.store';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiClientError } from '@knowtis/api-client';
import type * as DataAccessNotes from '@knowtis/data-access-notes';
import { notesQueryKeys } from '@knowtis/data-access-notes';
import { TooltipProvider } from '@knowtis/design-system';
import { EMAIL_NOT_VERIFIED_CODE } from '@knowtis/shared-types';

import {
  createAuthApiMock,
  createAuthOnlyWrapper,
  HARNESS_PROFILE,
} from '../../test/auth-harness';
import { ShareDialog } from './ShareDialog';

const updateMutateAsync = vi.fn<(vars: unknown) => Promise<unknown>>();
const toastSuccess = vi.fn();
const toastError = vi.fn();

vi.mock('@knowtis/data-access-notes', async (importOriginal) => ({
  ...(await importOriginal<typeof DataAccessNotes>()),
  useUpdateNote: () => ({ mutateAsync: updateMutateAsync, isPending: false }),
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

const AuthOnly = createAuthOnlyWrapper(createAuthApiMock(), {
  user: HARNESS_PROFILE,
});

const AnonymousAuthOnly = createAuthOnlyWrapper(createAuthApiMock(), {
  user: { ...HARNESS_PROFILE, isAnonymous: true },
});

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={queryClient}>
    <AuthOnly>
      <TooltipProvider>{children}</TooltipProvider>
    </AuthOnly>
  </QueryClientProvider>
);

const anonymousWrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={queryClient}>
    <AnonymousAuthOnly>
      <TooltipProvider>{children}</TooltipProvider>
    </AnonymousAuthOnly>
  </QueryClientProvider>
);

function DetailObserver() {
  useQuery({
    queryKey: notesQueryKeys.detail('n1'),
    queryFn: () => new Promise(() => undefined),
  });
  return null;
}

function renderDialog(
  overrides: Partial<Parameters<typeof ShareDialog>[0]>,
  renderWrapper = wrapper
) {
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
    { wrapper: renderWrapper }
  );
}

const clickOption = (name: string) =>
  userEvent.click(screen.getByRole('radio', { name: new RegExp(name) }));

describe('ShareDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    updateMutateAsync.mockResolvedValue({});
    queryClient = new QueryClient();
    useVerifyEmailStore.setState({ isOpen: false });
  });

  it('passes the shared close-dialog key to the close control', () => {
    renderDialog({ shareToken: null });

    expect(
      screen.getByRole('button', { name: 'common:labels.closeDialog' })
    ).toBeInTheDocument();
  });

  it('announces a first share as a created link', async () => {
    renderDialog({ shareToken: null });

    await clickOption('share.anyoneWithLink');

    await waitFor(() =>
      expect(toastSuccess).toHaveBeenCalledWith('share.linkCreatedToast')
    );
  });

  it('announces a share as resumed when the note already holds a token', async () => {
    renderDialog({ shareToken: 'tok', generalAccess: 'restricted' });

    await clickOption('share.anyoneWithLink');

    await waitFor(() =>
      expect(toastSuccess).toHaveBeenCalledWith('share.linkResumedToast')
    );
  });

  it('announces going private as a paused link', async () => {
    renderDialog({ shareToken: 'tok', generalAccess: 'anyone_with_link' });

    await clickOption('share.restricted');

    await waitFor(() =>
      expect(toastSuccess).toHaveBeenCalledWith('share.linkPausedToast')
    );
  });

  it('offers verification rather than a dead error when the gate refuses the share', async () => {
    updateMutateAsync.mockRejectedValue(
      new ApiClientError('Verify your email', 403, EMAIL_NOT_VERIFIED_CODE)
    );
    renderDialog({ shareToken: null });

    await clickOption('share.anyoneWithLink');

    await waitFor(() =>
      expect(useVerifyEmailStore.getState().isOpen).toBe(true)
    );
    expect(toastError).not.toHaveBeenCalled();
  });

  it('sends an anonymous visitor to sign up rather than to a retry that cannot work', async () => {
    updateMutateAsync.mockRejectedValue(
      new ApiClientError('Verify your email', 403, EMAIL_NOT_VERIFIED_CODE)
    );
    renderDialog({ shareToken: null }, anonymousWrapper);

    await clickOption('share.anyoneWithLink');

    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith('verifyEmail.gateSignUpToast')
    );
    expect(toastError).not.toHaveBeenCalledWith('share.accessChangeError');
    expect(useVerifyEmailStore.getState().isOpen).toBe(false);
  });

  it('reports a failed access change instead of staying silent', async () => {
    updateMutateAsync.mockRejectedValue(new Error('nope'));
    renderDialog({ shareToken: 'tok', generalAccess: 'anyone_with_link' });

    await clickOption('share.restricted');

    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith('share.accessChangeError')
    );
    expect(toastSuccess).not.toHaveBeenCalled();
  });

  it('ignores a click on the access level already in effect', async () => {
    renderDialog({ generalAccess: 'restricted' });

    await clickOption('share.restricted');

    expect(updateMutateAsync).not.toHaveBeenCalled();
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

    await userEvent.click(screen.getByRole('radio', { name: 'share.editor' }));

    await waitFor(() =>
      expect(toastSuccess).toHaveBeenCalledWith('share.permissionEditorToast')
    );
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
        screen.getByRole('radio', { name: /share.restricted/ })
      ).toBeDisabled()
    );

    await clickOption('share.restricted');
    expect(updateMutateAsync).not.toHaveBeenCalled();
  });
  it('exposes both option groups and their selection to assistive tech', () => {
    renderDialog({ generalAccess: 'anyone_with_link', shareToken: 'tok' });

    expect(
      screen.getByRole('radiogroup', { name: 'share.generalAccess' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('radiogroup', { name: 'share.linkAccess' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('radio', { name: /share.anyoneWithLink/ })
    ).toBeChecked();
    expect(
      screen.getByRole('radio', { name: /share.restricted/ })
    ).not.toBeChecked();
    expect(screen.getByRole('radio', { name: 'share.viewer' })).toBeChecked();
  });
});
