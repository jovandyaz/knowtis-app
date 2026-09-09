import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiClientError, notesApi } from '@knowtis/api-client';
import type * as ApiClient from '@knowtis/api-client';
import { notesQueryKeys } from '@knowtis/data-access-notes';

import {
  deferred,
  SHARE_EDITOR,
  SHARE_NOTE,
  SHARE_OWNER,
  shareHarness,
  waitForPeople,
} from '../test/share-harness';
import { NoteEditorPage } from './NoteEditorPage';

vi.mock('@knowtis/api-client', async (load) => {
  const actual = await load<typeof ApiClient>();
  return {
    ...actual,
    notesApi: {
      ...actual.notesApi,
      getById: vi.fn(),
      getPeople: vi.fn(),
      upsertPerson: vi.fn(),
      update: vi.fn(),
    },
  };
});
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn(),
  useParams: () => ({ noteId: 'n1' }),
}));
vi.mock('@knowtis/crdt', () => ({
  useYjs: () => ({ getYDoc: vi.fn() }),
  docStateToBase64: vi.fn(),
}));
vi.mock('@knowtis/data-access-feature-flags', () => ({
  useFeatureFlag: () => false,
  useFeatureFlags: () => ({ isPending: false }),
}));
vi.mock('@/components/editor/CollaborativeEditor', () => ({
  CollaborativeEditor: () => null,
}));
vi.mock('@/components/organization/NotePropertiesRow', () => ({
  NotePropertiesRow: () => null,
}));
vi.mock('@/lib/analytics/product-events', () => ({
  captureProductEvent: vi.fn(),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

function renderHost() {
  const harness = shareHarness();
  render(
    <>
      <div
        id="note-controls-portal"
        role="group"
        aria-label="Desktop note controls"
      />
      <NoteEditorPage />
    </>,
    { wrapper: harness.wrapper }
  );
  return harness;
}

async function shareButton() {
  return within(
    screen.getByRole('group', { name: 'Desktop note controls' })
  ).findByRole('button', { name: 'Share' });
}

async function openShare() {
  await userEvent.click(await shareButton());
  await waitForPeople();
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(notesApi.getById).mockResolvedValue({
    ...SHARE_NOTE,
    content: '<p>Existing note</p>',
  });
  vi.mocked(notesApi.getPeople).mockResolvedValue([SHARE_OWNER, SHARE_EDITOR]);
  vi.mocked(notesApi.upsertPerson).mockResolvedValue({
    ...SHARE_EDITOR,
    permission: 'viewer',
  });
  vi.mocked(notesApi.update).mockResolvedValue({
    ...SHARE_NOTE,
    title: 'Autosaved title',
  });
});
afterEach(cleanup);

describe('People sharing in the note editor host', () => {
  it('preserves the mounted editor and People draft through failed write reconciliation and retry', async () => {
    renderHost();
    const title = await screen.findByPlaceholderText('Note title...');
    await openShare();
    await userEvent.type(
      screen.getByRole('textbox', { name: 'Email' }),
      'draft@example.com'
    );
    vi.mocked(notesApi.getById).mockRejectedValue(
      new ApiClientError('temporarily unavailable', 503)
    );
    await userEvent.click(
      within(
        screen.getByRole('listitem', { name: SHARE_EDITOR.user.email })
      ).getByRole('radio', { name: 'Viewer' })
    );
    await waitFor(() => expect(notesApi.upsertPerson).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        "Couldn't refresh access"
      )
    );
    expect(title).toBeInTheDocument();
    expect(
      screen.getByRole('dialog', { name: 'Share "A note"' })
    ).toBeVisible();
    expect(screen.getByRole('textbox', { name: 'Email' })).toHaveValue(
      'draft@example.com'
    );
    expect(screen.getByRole('button', { name: 'Add person' })).toBeDisabled();
    vi.mocked(notesApi.getById).mockResolvedValue(SHARE_NOTE);
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await waitForPeople();
    expect(screen.getByRole('textbox', { name: 'Email' })).toHaveValue(
      'draft@example.com'
    );
    expect(title).toBeInTheDocument();
  });

  it('does not let an autosave complete the held sharing authority read', async () => {
    const authority = deferred<typeof SHARE_NOTE>();
    renderHost();
    const title = await screen.findByPlaceholderText('Note title...');
    vi.mocked(notesApi.getById).mockImplementationOnce(() => authority.promise);
    fireEvent.change(title, { target: { value: 'Autosaved title' } });
    await userEvent.click(await shareButton());
    await waitFor(() => expect(notesApi.getPeople).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(notesApi.update).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(notesApi.getById).toHaveBeenCalledTimes(3));
    expect(screen.getByRole('button', { name: 'Add person' })).toBeDisabled();
    expect(
      screen.getByRole('radio', { name: /Anyone with the link/ })
    ).toBeDisabled();
    await act(async () =>
      authority.resolve({ ...SHARE_NOTE, editorsCanShare: false })
    );
    await waitForPeople();
    expect(
      screen.getByRole('switch', { name: 'Editors can share' })
    ).not.toBeChecked();
  });

  it('offers recovery for a background note failure without replacing the loaded editor', async () => {
    const { client } = renderHost();
    const title = await screen.findByPlaceholderText('Note title...');
    vi.mocked(notesApi.getById).mockRejectedValue(new TypeError('offline'));
    await act(async () => {
      await client.invalidateQueries({ queryKey: notesQueryKeys.detail('n1') });
    });
    expect(await screen.findByRole('alert')).toHaveTextContent(
      "Couldn't refresh this note. Your open note is still here."
    );
    expect(title).toBeInTheDocument();
    vi.mocked(notesApi.getById).mockResolvedValue(SHARE_NOTE);
    await userEvent.click(screen.getByRole('button', { name: 'Refresh note' }));
    await waitFor(() =>
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    );
    expect(title).toBeInTheDocument();
  });

  it.each([401, 403, 404])(
    'still removes the cached editor and dialog after terminal %s',
    async (status) => {
      const { client } = renderHost();
      const title = await screen.findByPlaceholderText('Note title...');
      await openShare();
      vi.mocked(notesApi.getById).mockRejectedValue(
        new ApiClientError('terminal', status)
      );
      await act(async () => {
        await client.invalidateQueries({
          queryKey: notesQueryKeys.detail('n1'),
        });
      });
      await waitFor(() => expect(title).not.toBeInTheDocument());
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: 'Back to Notes' })
      ).toBeVisible();
    }
  );
});
