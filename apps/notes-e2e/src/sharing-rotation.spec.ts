import { expect } from '@playwright/test';
import { z } from 'zod';

import { E2E } from '../support/environment';
import {
  assertCutoff,
  beginCutoff,
  connectNote,
  deniedWrite,
  type RealtimeClient,
} from './fixtures/realtime.fixture';
import { test, type SharingActor } from './fixtures/sharing.fixture';

async function currentToken(owner: SharingActor, noteId: string) {
  const response = await owner.context.request.get(
    `${E2E.apiA}/notes/${noteId}`,
    { headers: owner.headers }
  );
  expect(response.status()).toBe(200);
  return z
    .object({ shareToken: z.string().min(1) })
    .parse(await response.json()).shareToken;
}

test('rotation retires the old link while direct permissions survive, including pause and resume', async ({
  sharing,
}, testInfo) => {
  const { owner, guest, editor, viewer } = sharing;
  const note = await owner.createNote('Rotation acceptance');
  await owner.share(note.id, editor.email, 'editor');
  await owner.share(note.id, viewer.email, 'viewer');
  const opened = await owner.update(note.id, {
    generalAccess: 'anyone_with_link',
    generalAccessPermission: 'editor',
  });
  const tokenA = z.string().min(1).parse(opened.shareToken);
  const clients: RealtimeClient[] = [];
  let traffic: ReturnType<typeof setInterval> | undefined;
  const connect = (
    token: string,
    shareToken?: string,
    instance: 'a' | 'b' = 'b'
  ) => {
    const client = connectNote(note.id, token, {
      ...(shareToken ? { shareToken } : {}),
      instance,
    });
    clients.push(client);
    return client;
  };
  try {
    const ownerWire = connect(owner.accessToken, undefined, 'a');
    const linkA = connect(guest.accessToken, tokenA);
    const directEditor = connect(editor.accessToken, tokenA);
    const directViewer = connect(viewer.accessToken, tokenA);
    await Promise.all(clients.map((client) => client.synced()));
    directViewer.write('link-elevated', 'accepted');
    await expect.poll(() => ownerWire.read('link-elevated')).toBe('accepted');
    await guest.page.goto(`/s/${tokenA}`);
    await expect(
      guest.page.getByRole('button', { name: 'Edit', exact: true }).last()
    ).toBeVisible();
    await guest.page
      .getByRole('button', { name: 'Edit', exact: true })
      .last()
      .click();
    await expect(guest.page.locator('.tiptap')).toHaveAttribute(
      'contenteditable',
      'true'
    );
    await owner.page.goto(`/notes/${note.id}`);
    await owner.page
      .getByRole('button', { name: 'Share', exact: true })
      .click();
    await owner.page
      .getByRole('button', { name: 'Change share link', exact: true })
      .click();
    await expect(
      owner.page.getByRole('button', { name: 'Cancel', exact: true })
    ).toBeFocused();
    let rotations = 0;
    const rotationUrl = `${E2E.apiA}/notes/${note.id}/share-link/rotate`;
    await owner.page.route(rotationUrl, async (route) => {
      rotations++;
      await route.continue();
    });
    let sequence = 0;
    traffic = setInterval(() => {
      sequence++;
      ownerWire.write('owner-traffic', sequence);
      linkA.write('guest-link', sequence);
      directViewer.write('guest-direct-viewer', sequence);
    }, 20);
    await expect
      .poll(() => ownerWire.guestApplications.length)
      .toBeGreaterThan(2);
    await expect.poll(() => linkA.receipts.length).toBeGreaterThan(2);
    const observation = beginCutoff([linkA, directViewer], [ownerWire]);
    await owner.page
      .getByRole('button', { name: 'Change link', exact: true })
      .dblclick();
    await expect(
      owner.page.getByRole('dialog', { name: 'Change this share link?' })
    ).toHaveCount(0);
    expect(rotations).toBe(1);
    await owner.page.unroute(rotationUrl);
    const tokenB = await currentToken(owner, note.id);
    expect(tokenB).not.toBe(tokenA);
    const measurements = await assertCutoff(observation);
    clearInterval(traffic);
    traffic = undefined;
    await testInfo.attach('rotation-timing', {
      body: JSON.stringify(measurements),
      contentType: 'application/json',
    });
    await expect(guest.page.locator('.tiptap')).toHaveCount(0, {
      timeout: 5000,
    });
    await directViewer.reauthenticate();
    expect(directViewer.scopes.at(-1)).toBe('readonly');
    await deniedWrite(directViewer, ownerWire, 'viewer-after-rotation');
    const retiredReceipts = linkA.receipts.length;
    directEditor.write('direct-survives', 'accepted');
    await expect.poll(() => ownerWire.read('direct-survives')).toBe('accepted');
    expect(linkA.receipts.length).toBe(retiredReceipts);
    expect(linkA.read('direct-survives')).toBeUndefined();
    expect(
      (
        await owner.context.request.get(`${E2E.apiA}/notes/shared/${tokenA}`)
      ).status()
    ).toBe(404);
    expect(
      (
        await owner.context.request.get(`${E2E.apiA}/notes/shared/${tokenB}`)
      ).status()
    ).toBe(200);
    expect(
      (
        await owner.context.request.get(
          `${E2E.apiA}/notes/shared/${tokenA}/artifacts`
        )
      ).status()
    ).toBe(404);
    const artifacts = await owner.context.request.get(
      `${E2E.apiA}/notes/shared/${tokenB}/artifacts`
    );
    expect(artifacts.status()).toBe(200);
    expect(await artifacts.json()).toEqual([]);
    const rejected = connect(guest.accessToken, tokenA);
    await expect.poll(() => rejected.failures.length).toBeGreaterThan(0);
    const linkB = connect(guest.accessToken, tokenB);
    await linkB.synced();
    await owner.update(note.id, { generalAccess: 'restricted' });
    await expect.poll(() => linkB.closes.length).toBeGreaterThan(0);
    expect(
      (
        await owner.context.request.get(`${E2E.apiA}/notes/shared/${tokenB}`)
      ).status()
    ).toBe(404);
    await owner.update(note.id, { generalAccess: 'anyone_with_link' });
    expect(await currentToken(owner, note.id)).toBe(tokenB);
    expect(
      (
        await owner.context.request.get(`${E2E.apiA}/notes/shared/${tokenA}`)
      ).status()
    ).toBe(404);
    expect(
      (
        await owner.context.request.get(`${E2E.apiA}/notes/shared/${tokenB}`)
      ).status()
    ).toBe(200);
    await connect(guest.accessToken, tokenB).synced();
  } finally {
    clearInterval(traffic);
    clients.forEach((client) => client.close());
  }
});

test('a lost response after commit reconciles the link without repeating rotation', async ({
  sharing,
}) => {
  const { owner } = sharing;
  const note = await owner.createNote('Uncertain rotation');
  await owner.update(note.id, { generalAccess: 'anyone_with_link' });
  const before = await currentToken(owner, note.id);
  await owner.page.goto(`/notes/${note.id}`);
  await owner.page.getByRole('button', { name: 'Share', exact: true }).click();
  await owner.page
    .getByRole('button', { name: 'Change share link', exact: true })
    .click();
  let rotations = 0;
  const rotationUrl = `${E2E.apiA}/notes/${note.id}/share-link/rotate`;
  await owner.page.route(rotationUrl, async (route) => {
    rotations++;
    const committed = await route.fetch();
    expect(committed.status()).toBe(200);
    await route.abort('failed');
  });
  try {
    await owner.page
      .getByRole('button', { name: 'Change link', exact: true })
      .click();
    await expect(owner.page.getByRole('alert')).toContainText(
      'could not confirm whether the link changed'
    );
    await expect(
      owner.page.getByRole('button', { name: 'Change link', exact: true })
    ).toHaveCount(0);
    const after = await currentToken(owner, note.id);
    expect(after).not.toBe(before);
    expect(rotations).toBe(1);
    const confirmation = owner.page.getByRole('dialog', {
      name: 'Change this share link?',
    });
    await confirmation
      .getByRole('button', { name: 'Close', exact: true })
      .last()
      .click();
    await expect(
      owner.page.getByText(`${E2E.frontend}/s/${after}`, { exact: true })
    ).toBeVisible();
    expect(rotations).toBe(1);
  } finally {
    await owner.page.unroute(rotationUrl);
  }
});
