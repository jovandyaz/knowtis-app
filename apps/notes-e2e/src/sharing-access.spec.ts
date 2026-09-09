import { expect } from '@playwright/test';

import { CUTOFF_BUDGET_MS, E2E, E2E_PORT } from '../support/environment';
import {
  connectNote,
  deniedWrite,
  revokedWrite,
} from './fixtures/realtime.fixture';
import { test } from './fixtures/sharing.fixture';

function connectedTo(url: string, port: number) {
  const target = new URL(url);
  return (
    target.port === String(port) &&
    target.pathname.startsWith(E2E.collaborationPath)
  );
}

test('owner manages people while the recipient keeps the note open', async ({
  sharing,
}) => {
  const { owner, recipient } = sharing;
  await owner.setLocale('en');
  const note = await owner.createNote('People acceptance');
  await owner.page.goto(`/notes/${note.id}`);
  await expect
    .poll(() => owner.sockets.some((url) => connectedTo(url, E2E_PORT.apiA)))
    .toBe(true);
  await owner.page.getByRole('button', { name: 'Share', exact: true }).click();
  await expect(
    owner.page.getByRole('list', { name: 'People with access' })
  ).toBeVisible();
  await owner.page.getByLabel('Email', { exact: true }).fill(recipient.email);
  await owner.page
    .getByRole('button', { name: 'Add person', exact: true })
    .click();
  const row = owner.page.getByRole('listitem', {
    name: recipient.email,
    exact: true,
  });
  await expect(row).toBeVisible();
  await recipient.page.goto(`/notes/${note.id}`);
  await expect
    .poll(() =>
      recipient.sockets.some((url) => connectedTo(url, E2E_PORT.apiB))
    )
    .toBe(true);
  await expect(recipient.page.locator('.tiptap')).toHaveAttribute(
    'contenteditable',
    'false'
  );
  await row.getByRole('radio', { name: 'Editor', exact: true }).click();
  await expect(recipient.page.locator('.tiptap')).toHaveAttribute(
    'contenteditable',
    'true',
    { timeout: CUTOFF_BUDGET_MS }
  );
  await recipient.page.locator('.tiptap').click();
  await recipient.page.keyboard.press('ControlOrMeta+End');
  await recipient.page.keyboard.insertText(' recipient edit accepted');
  await expect(owner.page.locator('.tiptap')).toContainText(
    'recipient edit accepted'
  );
  const attacker = connectNote(note.id, recipient.accessToken);
  const observer = connectNote(note.id, owner.accessToken, { instance: 'a' });
  try {
    await Promise.all([attacker.synced(), observer.synced()]);
    attacker.write('before-downgrade', 'accepted');
    await expect.poll(() => observer.read('before-downgrade')).toBe('accepted');
    await row.getByRole('radio', { name: 'Viewer', exact: true }).click();
    await expect(recipient.page.locator('.tiptap')).toHaveAttribute(
      'contenteditable',
      'false',
      { timeout: CUTOFF_BUDGET_MS }
    );
    await expect.poll(() => attacker.closes.length).toBeGreaterThan(0);
    await attacker.reauthenticate();
    expect(attacker.scopes.at(-1)).toBe('readonly');
    await deniedWrite(attacker, observer, 'after-downgrade');
    await row
      .getByRole('button', { name: `Remove ${recipient.name}`, exact: true })
      .click();
    await expect(
      owner.page.getByRole('button', { name: 'Cancel', exact: true })
    ).toBeFocused();
    await owner.page
      .getByRole('button', { name: 'Remove access', exact: true })
      .click();
    await expect(row).toHaveCount(0);
    await expect(recipient.page.locator('.tiptap')).toHaveCount(0, {
      timeout: CUTOFF_BUDGET_MS,
    });
    await revokedWrite(attacker, observer, 'after-revocation');
  } finally {
    attacker.close();
    observer.close();
  }
});
