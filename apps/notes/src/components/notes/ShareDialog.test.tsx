import type { ReactNode } from 'react';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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

vi.mock('@knowtis/data-access-notes', () => ({
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

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient()}>
    <TooltipProvider>{children}</TooltipProvider>
  </QueryClientProvider>
);

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

  it('describes a private note without a link as having no link at all', () => {
    renderDialog({ shareToken: null, generalAccess: 'restricted' });

    expect(screen.getByText('share.restrictedDesc')).toBeInTheDocument();
    expect(screen.queryByText('share.restrictedDescPaused')).toBeNull();
  });

  it('describes a private note that kept its token as paused', () => {
    renderDialog({ shareToken: 'tok', generalAccess: 'restricted' });

    expect(screen.getByText('share.restrictedDescPaused')).toBeInTheDocument();
  });

  it('confirms a permission change on the link', async () => {
    renderDialog({ shareToken: 'tok', generalAccess: 'anyone_with_link' });

    await userEvent.click(screen.getByRole('button', { name: 'share.editor' }));
    settle();

    expect(toastSuccess).toHaveBeenCalledWith('share.permissionEditorToast');
  });
});
