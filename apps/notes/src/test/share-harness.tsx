import type { ReactNode } from 'react';
import { I18nextProvider } from 'react-i18next';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { render, screen, waitFor } from '@testing-library/react';
import { createInstance } from 'i18next';

import type { NoteDetail } from '@knowtis/api-client';
import { TooltipProvider } from '@knowtis/design-system';
import { enCommon, enNotes, esCommon, esNotes } from '@knowtis/shared-i18n';
import type { NotePerson } from '@knowtis/shared-types';

import { ShareDialog } from '../components/notes/ShareDialog';
import {
  createAuthApiMock,
  createAuthOnlyWrapper,
  HARNESS_PROFILE,
} from './auth-harness';

export const SHARE_OWNER: NotePerson = {
  user: {
    id: '10000000-0000-4000-8000-000000000001',
    name: 'Owner',
    email: 'owner@example.com',
    avatarUrl: null,
  },
  permission: 'owner',
};
export const SHARE_EDITOR: NotePerson = {
  user: {
    id: '10000000-0000-4000-8000-000000000002',
    name: 'Editor',
    email: 'editor@example.com',
    avatarUrl: null,
  },
  permission: 'editor',
};
export const SHARE_VIEWER: NotePerson = {
  user: {
    id: '10000000-0000-4000-8000-000000000003',
    name: 'Viewer',
    email: 'viewer@example.com',
    avatarUrl: null,
  },
  permission: 'viewer',
};
export const SHARE_NOTE: NoteDetail = {
  id: 'n1',
  title: 'A note',
  content: '',
  ownerId: SHARE_OWNER.user.id,
  owner: SHARE_OWNER.user,
  accessLevel: 'owner',
  generalAccess: 'restricted',
  generalAccessPermission: 'viewer',
  editorsCanShare: true,
  shareToken: null,
  tags: [],
  bucket: null,
  supertag: null,
  supertagFields: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};
export function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

export function shareHarness({
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  }),
  actor = SHARE_OWNER,
  locale = 'en',
}: { client?: QueryClient; actor?: NotePerson; locale?: string } = {}) {
  const i18n = createInstance();
  void i18n.init({
    lng: locale,
    fallbackLng: 'en',
    initAsync: false,
    interpolation: { escapeValue: false },
    resources: {
      en: { notes: enNotes, common: enCommon },
      es: { notes: esNotes, common: esCommon },
    },
  });
  const Auth = createAuthOnlyWrapper(createAuthApiMock(), {
    user: { ...HARNESS_PROFILE, ...actor.user },
  });
  function wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>
        <Auth>
          <I18nextProvider i18n={i18n}>
            <TooltipProvider>{children}</TooltipProvider>
          </I18nextProvider>
        </Auth>
      </QueryClientProvider>
    );
  }
  function dialog(props: Partial<Parameters<typeof ShareDialog>[0]> = {}) {
    return (
      <ShareDialog
        open
        onOpenChange={() => undefined}
        noteId={SHARE_NOTE.id}
        noteTitle={SHARE_NOTE.title}
        generalAccess={SHARE_NOTE.generalAccess}
        generalAccessPermission={SHARE_NOTE.generalAccessPermission}
        shareToken={SHARE_NOTE.shareToken}
        editorsCanShare={SHARE_NOTE.editorsCanShare}
        accessLevel={actor.permission}
        {...props}
      />
    );
  }
  return {
    client,
    wrapper,
    dialog,
    render: (props: Partial<Parameters<typeof ShareDialog>[0]> = {}) =>
      render(dialog(props), { wrapper }),
  };
}
export async function waitForPeople() {
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Add person' })).toBeEnabled()
  );
}
