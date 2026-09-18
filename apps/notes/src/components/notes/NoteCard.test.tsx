import { I18nextProvider } from 'react-i18next';

import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router';

import { render, screen } from '@testing-library/react';
import { createInstance } from 'i18next';
import { describe, expect, it, vi } from 'vitest';

import type { NoteWithAccess } from '@knowtis/api-client';
import { enNotes, esNotes } from '@knowtis/shared-i18n';
import type { NoteAccessLevel } from '@knowtis/shared-types';

import { NoteCard } from './NoteCard';

vi.mock('./NoteActionsMenu', () => ({
  NoteActionsMenu: ({ noteTitle }: { noteTitle: string }) => (
    <button type="button" aria-label={`actions:${noteTitle}`} />
  ),
}));

function note(accessLevel: NoteAccessLevel): NoteWithAccess {
  return {
    id: 'note-1',
    title: 'Roadmap',
    content: '<p>Quarterly plan</p>',
    ownerId: 'user-1',
    accessLevel,
    tags: [],
    generalAccess: 'restricted',
    generalAccessPermission: 'viewer',
    shareToken: null,
    editorsCanShare: false,
    bucket: null,
    supertag: null,
    supertagFields: null,
    createdAt: new Date('2025-01-01T00:00:00.000Z'),
    updatedAt: new Date('2025-01-02T00:00:00.000Z'),
  };
}

async function renderCard(accessLevel: NoteAccessLevel, language: string) {
  const i18n = createInstance();
  await i18n.init({
    lng: language,
    fallbackLng: 'en',
    initAsync: false,
    interpolation: { escapeValue: false },
    resources: { en: { notes: enNotes }, es: { notes: esNotes } },
  });

  const rootRoute = createRootRoute({
    component: () => (
      <I18nextProvider i18n={i18n}>
        <NoteCard note={note(accessLevel)} />
        <Outlet />
      </I18nextProvider>
    ),
  });
  const noteRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/notes/$noteId',
    component: () => null,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([noteRoute]),
    history: createMemoryHistory({ initialEntries: ['/notes/other'] }),
  });

  render(<RouterProvider router={router} />);
  await screen.findByText('Roadmap');
}

describe('NoteCard', () => {
  it('names a viewer in the reader language, not in English', async () => {
    await renderCard('viewer', 'es');

    expect(screen.getByText(esNotes.share.viewer)).toBeInTheDocument();
    expect(screen.queryByText('Viewer')).not.toBeInTheDocument();
  });

  it('names an editor in the reader language', async () => {
    await renderCard('editor', 'es');

    expect(screen.getByText(esNotes.share.editor)).toBeInTheDocument();
  });

  it('reuses the share vocabulary in English too', async () => {
    await renderCard('viewer', 'en');

    expect(screen.getByText(enNotes.share.viewer)).toBeInTheDocument();
  });

  it('leaves the owner without a badge, since ownership needs no explaining', async () => {
    await renderCard('owner', 'es');

    expect(screen.queryByText(esNotes.share.owner)).not.toBeInTheDocument();
  });
});
