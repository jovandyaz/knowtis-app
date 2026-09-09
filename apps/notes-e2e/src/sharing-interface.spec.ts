import { expect } from '@playwright/test';

import { E2E } from '../support/environment';
import { test } from './fixtures/sharing.fixture';

const layouts = [
  {
    language: 'en',
    width: 1440,
    height: 900,
    share: 'Share',
    email: 'Email',
    people: 'People with access',
    add: 'Add person',
    retry: 'Try again',
  },
  {
    language: 'es',
    width: 390,
    height: 844,
    share: 'Compartir',
    email: 'Correo electrónico',
    people: 'Personas con acceso',
    add: 'Agregar persona',
    retry: 'Intentar de nuevo',
  },
] as const;

for (const layout of layouts) {
  test(`sharing keeps drafts and focus through a recoverable error at ${layout.width}px in ${layout.language}`, async ({
    sharing,
  }, testInfo) => {
    const { owner, recipient, viewer } = sharing;
    const note = await owner.createNote('Sharing interface acceptance');
    await owner.share(note.id, recipient.email, 'viewer');
    const desktop = owner.page.viewportSize();
    await owner.page.setViewportSize({
      width: layout.width,
      height: layout.height,
    });
    await owner.setLocale(layout.language);
    const errors: string[] = [];
    const collectError = (error: Error) => errors.push(error.message);
    owner.page.on('pageerror', collectError);
    await owner.page.goto(`/notes/${note.id}`);
    const noteUrl = `${E2E.apiA}/notes/${note.id}`;
    try {
      const trigger = owner.page.getByRole('button', {
        name: layout.share,
        exact: true,
      });
      await trigger.click();
      await expect(
        owner.page.getByRole('list', { name: layout.people })
      ).toBeVisible();
      const email = owner.page.getByLabel(layout.email, { exact: true });
      await email.fill(viewer.email);
      const editor = await owner.page.locator('.tiptap').elementHandle();
      if (!editor) {
        throw new Error('Mounted collaborative editor is missing');
      }
      await owner.page.route(noteUrl, async (route) => {
        if (route.request().method() === 'GET') {
          await route.fulfill({
            status: 503,
            contentType: 'application/json',
            body: JSON.stringify({ message: 'Temporary test outage' }),
          });
        } else {
          await route.continue();
        }
      });
      const row = owner.page.getByRole('listitem', {
        name: recipient.email,
        exact: true,
      });
      await row.getByRole('radio', { name: 'Editor', exact: true }).click();
      await expect(
        owner.page.getByRole('button', { name: layout.retry, exact: true })
      ).toBeVisible();
      await expect(email).toHaveValue(viewer.email);
      expect(await editor.evaluate((element) => element.isConnected)).toBe(
        true
      );
      await expect(
        owner.page.getByRole('button', { name: layout.add, exact: true })
      ).toBeDisabled();
      await owner.page.unroute(noteUrl);
      await owner.page
        .getByRole('button', { name: layout.retry, exact: true })
        .click();
      await expect(
        owner.page.getByRole('button', { name: layout.add, exact: true })
      ).toBeEnabled();
      await expect(email).toHaveValue(viewer.email);
      const dialog = owner.page.getByRole('dialog');
      const box = await dialog.boundingBox();
      expect(box).not.toBeNull();
      if (box) {
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(layout.width + 1);
      }
      await testInfo.attach(`sharing-${layout.language}-${layout.width}`, {
        body: await owner.page.screenshot(),
        contentType: 'image/png',
      });
      await owner.page.keyboard.press('Escape');
      await expect(dialog).toHaveCount(0);
      await expect(trigger).toBeFocused();
      expect(errors).toEqual([]);
    } finally {
      await owner.page.unroute(noteUrl);
      owner.page.off('pageerror', collectError);
      await owner.setLocale('en');
      if (desktop) {
        await owner.page.setViewportSize(desktop);
      }
    }
  });
}
