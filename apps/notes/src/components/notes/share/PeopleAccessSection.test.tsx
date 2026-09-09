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

import { ApiClientError, notesApi } from '@knowtis/api-client';
import type * as ApiClient from '@knowtis/api-client';
import type { NotePerson } from '@knowtis/shared-types';

import { useVerifyEmailStore } from '../../../stores/verify-email.store';
import {
  deferred,
  SHARE_EDITOR,
  SHARE_NOTE,
  SHARE_OWNER,
  SHARE_VIEWER,
  shareHarness,
  waitForPeople,
} from '../../../test/share-harness';

vi.mock('@knowtis/api-client', async (load) => {
  const actual = await load<typeof ApiClient>();
  return {
    ...actual,
    notesApi: {
      ...actual.notesApi,
      getById: vi.fn(),
      getPeople: vi.fn(),
      upsertPerson: vi.fn(),
      revokePerson: vi.fn(),
      update: vi.fn(),
    },
  };
});
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
let people: NotePerson[];
beforeEach(() => {
  vi.resetAllMocks();
  people = [SHARE_OWNER, SHARE_EDITOR, SHARE_VIEWER];
  vi.mocked(notesApi.getById).mockResolvedValue(SHARE_NOTE);
  vi.mocked(notesApi.getPeople).mockImplementation(async () => people);
  vi.mocked(notesApi.upsertPerson).mockImplementation(
    async (_noteId, input) => {
      const existing = people.find(
        (person) => person.user.email === input.email
      ) ?? {
        ...SHARE_VIEWER,
        user: {
          ...SHARE_VIEWER.user,
          id: '10000000-0000-4000-8000-000000000004',
          name: 'New person',
          email: input.email,
        },
      };
      const saved = { ...existing, permission: input.permission };
      people = [
        ...people.filter((person) => person.user.id !== saved.user.id),
        saved,
      ];
      return saved;
    }
  );
  vi.mocked(notesApi.revokePerson).mockImplementation(
    async (_noteId, userId) => {
      people = people.filter((person) => person.user.id !== userId);
    }
  );
  useVerifyEmailStore.setState({ isOpen: false });
});
afterEach(cleanup);

const row = (person: NotePerson) =>
  within(screen.getByRole('listitem', { name: person.user.email }));

describe('People access interactions', () => {
  it('rejects invalid email locally with an associated error', async () => {
    shareHarness().render();
    await waitForPeople();
    await userEvent.type(
      screen.getByRole('textbox', { name: 'Email' }),
      'invalid'
    );
    await userEvent.click(screen.getByRole('button', { name: 'Add person' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Enter a valid email address.'
    );
    expect(screen.getByRole('textbox', { name: 'Email' })).toHaveAttribute(
      'aria-invalid',
      'true'
    );
    expect(notesApi.upsertPerson).not.toHaveBeenCalled();
  });

  it('does not retry a throttled add automatically', async () => {
    vi.mocked(notesApi.upsertPerson).mockRejectedValue(
      new ApiClientError('limited', 429)
    );
    shareHarness().render();
    await waitForPeople();
    await userEvent.type(
      screen.getByRole('textbox', { name: 'Email' }),
      'new@example.com'
    );
    await userEvent.click(screen.getByRole('button', { name: 'Add person' }));
    await screen.findByRole('alert');
    expect(notesApi.upsertPerson).toHaveBeenCalledTimes(1);
  });

  it('normalizes email, adds an authoritative person, and clears only a successful add draft', async () => {
    shareHarness().render();
    await waitForPeople();
    await userEvent.type(
      screen.getByRole('textbox', { name: 'Email' }),
      ' NEW@Example.com '
    );
    await userEvent.click(screen.getByRole('button', { name: 'Add person' }));
    expect(await screen.findByText('new@example.com')).toBeVisible();
    expect(screen.getByRole('textbox', { name: 'Email' })).toHaveValue('');
    expect(notesApi.upsertPerson).toHaveBeenCalledWith('n1', {
      email: 'new@example.com',
      permission: 'viewer',
    });
    expect(screen.getByRole('status')).toHaveTextContent('Permissions saved.');
  });

  it('keeps the email and permission draft when another person changes', async () => {
    shareHarness().render();
    await waitForPeople();
    await userEvent.type(
      screen.getByRole('textbox', { name: 'Email' }),
      'draft@example.com'
    );
    await userEvent.click(
      within(
        screen.getByRole('radiogroup', { name: 'New person permission' })
      ).getByRole('radio', { name: 'Editor' })
    );
    await userEvent.click(
      row(SHARE_EDITOR).getByRole('radio', { name: 'Viewer' })
    );
    await waitFor(() =>
      expect(
        row(SHARE_EDITOR).getByRole('radio', { name: 'Viewer' })
      ).toBeChecked()
    );
    expect(screen.getByRole('textbox', { name: 'Email' })).toHaveValue(
      'draft@example.com'
    );
    expect(
      within(
        screen.getByRole('radiogroup', { name: 'New person permission' })
      ).getByRole('radio', { name: 'Editor' })
    ).toBeChecked();
  });

  it('uses one generic target error and preserves failed drafts for retry', async () => {
    vi.mocked(notesApi.upsertPerson).mockRejectedValueOnce(
      new ApiClientError(
        'recipient database details',
        422,
        'PERSON_NOT_ADDABLE'
      )
    );
    shareHarness().render();
    await waitForPeople();
    await userEvent.type(
      screen.getByRole('textbox', { name: 'Email' }),
      'new@example.com'
    );
    await userEvent.click(screen.getByRole('button', { name: 'Add person' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This person cannot be added. Check the email and try another person.'
    );
    expect(
      screen.queryByText('recipient database details')
    ).not.toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Email' })).toHaveValue(
      'new@example.com'
    );
    await userEvent.click(screen.getByRole('button', { name: 'Add person' }));
    expect(await screen.findByText('new@example.com')).toBeVisible();
  });

  it('guards two native submit events and mixed row actions before rendering pending', async () => {
    const save = deferred<NotePerson>();
    vi.mocked(notesApi.upsertPerson).mockReturnValue(save.promise);
    shareHarness().render();
    await waitForPeople();
    await userEvent.type(
      screen.getByRole('textbox', { name: 'Email' }),
      'new@example.com'
    );
    act(() => {
      fireEvent.submit(screen.getByRole('form', { name: 'Add person' }));
      fireEvent.submit(screen.getByRole('form', { name: 'Add person' }));
      fireEvent.click(row(SHARE_EDITOR).getByRole('radio', { name: 'Viewer' }));
    });
    await waitFor(() => expect(notesApi.upsertPerson).toHaveBeenCalledTimes(1));
    expect(notesApi.upsertPerson).toHaveBeenCalledWith('n1', {
      email: 'new@example.com',
      permission: 'viewer',
    });
    expect(screen.queryByText('new@example.com')).not.toBeInTheDocument();
    await act(async () => save.resolve(SHARE_VIEWER));
  });

  it('offers verification after a widening refusal and still permits unverified removal', async () => {
    vi.mocked(notesApi.upsertPerson).mockRejectedValueOnce(
      new ApiClientError('verify', 403, 'EMAIL_NOT_VERIFIED')
    );
    shareHarness().render();
    await waitForPeople();
    await userEvent.click(
      row(SHARE_VIEWER).getByRole('radio', { name: 'Editor' })
    );
    await waitFor(() =>
      expect(useVerifyEmailStore.getState().isOpen).toBe(true)
    );
    await waitForPeople();
    await userEvent.click(
      row(SHARE_VIEWER).getByRole('button', { name: 'Remove Viewer' })
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'Remove access' })
    );
    await waitFor(() =>
      expect(
        screen.queryByText(SHARE_VIEWER.user.email)
      ).not.toBeInTheDocument()
    );
  });

  it('names the removal target, focuses Cancel, and only warns about a link when open', async () => {
    vi.mocked(notesApi.getById).mockResolvedValue({
      ...SHARE_NOTE,
      generalAccess: 'anyone_with_link',
      shareToken: 'token',
    });
    shareHarness().render();
    await waitForPeople();
    const trigger = row(SHARE_VIEWER).getByRole('button', {
      name: 'Remove Viewer',
    });
    await userEvent.click(trigger);
    const dialog = screen.getByRole('dialog', {
      name: 'Remove access for Viewer?',
    });
    expect(dialog).toHaveTextContent(
      'They may still access the note through an open link.'
    );
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus();
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it('preserves the confirmation on a failure and removes the row only after a successful retry', async () => {
    vi.mocked(notesApi.revokePerson).mockRejectedValueOnce(
      new ApiClientError('private details', 500)
    );
    shareHarness().render();
    await waitForPeople();
    await userEvent.click(
      row(SHARE_VIEWER).getByRole('button', { name: 'Remove Viewer' })
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'Remove access' })
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      "Couldn't remove access. Try again."
    );
    expect(
      screen.getByRole('dialog', { name: 'Remove access for Viewer?' })
    ).toBeVisible();
    await userEvent.click(
      screen.getByRole('button', { name: 'Remove access' })
    );
    await waitFor(() =>
      expect(
        screen.queryByRole('dialog', { name: 'Remove access for Viewer?' })
      ).not.toBeInTheDocument()
    );
    expect(screen.queryByText(SHARE_VIEWER.user.email)).not.toBeInTheDocument();
  });

  it('reports a saved write separately from a failed refresh and leaves controls disabled', async () => {
    shareHarness().render();
    await waitForPeople();
    vi.mocked(notesApi.getPeople).mockRejectedValue(new Error('offline'));
    await userEvent.click(
      row(SHARE_EDITOR).getByRole('radio', { name: 'Viewer' })
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      "Couldn't refresh access"
    );
    expect(screen.getByRole('status')).toHaveTextContent('Permissions saved.');
    expect(screen.getByRole('button', { name: 'Add person' })).toBeDisabled();
    expect(screen.queryByText(SHARE_EDITOR.user.email)).not.toBeInTheDocument();
  });

  it('has localized Spanish actions and immutable owner labels', async () => {
    shareHarness({ locale: 'es' }).render();
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Agregar persona' })
      ).toBeEnabled()
    );
    expect(
      screen.getByRole('textbox', { name: 'Correo electrónico' })
    ).toBeVisible();
    expect(row(SHARE_OWNER).getByText('Propietario')).toBeVisible();
    await userEvent.click(
      row(SHARE_VIEWER).getByRole('button', { name: 'Quitar a Viewer' })
    );
    expect(screen.getByRole('button', { name: 'Cancelar' })).toHaveFocus();
  });
});
