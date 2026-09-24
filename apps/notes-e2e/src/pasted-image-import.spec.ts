import { createServer } from 'node:http';

import { expect, type Locator, type Route } from '@playwright/test';
import { z } from 'zod';

import { STORED_IMAGE_HOST } from '@knowtis/shared-util';

import { E2E } from '../support/environment';
import {
  test as sharingTest,
  type SharingActor,
} from './fixtures/sharing.fixture';

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64'
);
const IMAGE_PATH = '/chart.png';
const MISSING_IMAGE_PATH = '/missing.png';
const IMPORTER_USER_AGENT_RE = /^Knowtis-ImageImport\//;
const PASTED_ALT = 'Quarterly chart';
const IMPORTED_IMAGE_ID = '6f1d2c3b-4a59-4e8f-9d0c-1b2a3c4d5e6f';
const STORAGE_FAILURE_STATUS = 500;
const REFUSED_STATUS = 422;
const PERSIST_TIMEOUT_MS = 15_000;
const IMPORT_FAILED_TOAST_RE =
  /couldn't copy 1 image into the note|no se pudo copiar 1 imagen a la nota/i;

const noteContentSchema = z.object({ content: z.string() });
const refusalSchema = z.object({ code: z.string() });

interface ImageFetch {
  path: string | undefined;
  userAgent: string | undefined;
}

interface ImageOrigin {
  url(path: string): string;
  fetchesByApi(path: string): number;
}

const test = sharingTest.extend<{ imageOrigin: ImageOrigin }>({
  // eslint-disable-next-line no-empty-pattern -- Playwright requires a destructured fixture dependency list.
  imageOrigin: async ({}, use) => {
    const fetches: ImageFetch[] = [];
    const server = createServer((request, response) => {
      fetches.push({
        path: request.url,
        userAgent: request.headers['user-agent'],
      });
      if (request.url === IMAGE_PATH) {
        response.writeHead(200, { 'content-type': 'image/png' }).end(PNG);
      } else {
        response.writeHead(404).end();
      }
    });
    await new Promise<void>((done) => server.listen(0, E2E.host, done));
    const address = server.address();
    if (address === null || typeof address === 'string') {
      throw new Error('The image origin is not listening on a port');
    }
    try {
      await use({
        url: (path) => `http://${E2E.host}:${address.port}${path}`,
        fetchesByApi: (path) =>
          fetches.filter(
            (fetch) =>
              fetch.path === path &&
              IMPORTER_USER_AGENT_RE.test(fetch.userAgent ?? '')
          ).length,
      });
    } finally {
      server.closeAllConnections();
      await new Promise<void>((done) => server.close(() => done()));
    }
  },
});

async function openNote(actor: SharingActor, noteId: string) {
  await actor.page.goto(`/notes/${noteId}`);
  const editor = actor.page.locator('.tiptap');
  await expect(editor).toHaveAttribute('contenteditable', 'true');
  await editor.click();
  await actor.page.keyboard.press('ControlOrMeta+End');
  return editor;
}

async function pasteHtml(editor: Locator, html: string) {
  await editor.evaluate((element, markup) => {
    const clipboardData = new DataTransfer();
    clipboardData.setData('text/html', markup);
    element.dispatchEvent(
      new ClipboardEvent('paste', {
        clipboardData,
        bubbles: true,
        cancelable: true,
      })
    );
  }, html);
}

async function storedContent(actor: SharingActor, noteId: string) {
  const response = await actor.context.request.get(
    `${E2E.apiA}/notes/${noteId}`,
    { headers: actor.headers }
  );
  expect(response.status()).toBe(200);
  return noteContentSchema.parse(await response.json()).content;
}

function importRoute(noteId: string) {
  return `${E2E.apiA}/notes/${noteId}/images/import`;
}

test.describe('pasted image import', () => {
  test('copies an image pasted from another site into the note', async ({
    sharing,
    imageOrigin,
  }) => {
    const { owner } = sharing;
    const note = await owner.createNote('Pasted image import');
    const pastedUrl = imageOrigin.url(IMAGE_PATH);
    const storedUrl = `https://${STORED_IMAGE_HOST}/notes/${note.id}/imported-e2e.png`;
    const storedImages = `https://${STORED_IMAGE_HOST}/**`;
    const imports: unknown[] = [];
    const upstreamStatuses: number[] = [];
    // The harness API has no Blob store token: it fetches and checks the image
    // for real and then cannot store it, so the browser gets the answer an API
    // with a Blob store gives.
    const answerAsBlobStore = async (route: Route) => {
      imports.push(route.request().postDataJSON());
      const response = await route.fetch();
      upstreamStatuses.push(response.status());
      await route.fulfill({
        response,
        status: 201,
        json: {
          id: IMPORTED_IMAGE_ID,
          url: storedUrl,
          width: null,
          height: null,
        },
      });
    };
    const serveStoredImage = (route: Route) =>
      route.fulfill({ contentType: 'image/png', body: PNG });
    await owner.page.route(importRoute(note.id), answerAsBlobStore);
    await owner.page.route(storedImages, serveStoredImage);
    try {
      const editor = await openNote(owner, note.id);
      await pasteHtml(editor, `<img src="${pastedUrl}" alt="${PASTED_ALT}">`);

      await expect(
        editor.getByRole('img', { name: PASTED_ALT })
      ).toHaveAttribute('src', storedUrl);
      expect(imports).toEqual([{ url: pastedUrl }]);
      expect(imageOrigin.fetchesByApi(IMAGE_PATH)).toBe(1);
      expect(upstreamStatuses).toEqual([STORAGE_FAILURE_STATUS]);
      await expect
        .poll(() => storedContent(owner, note.id), {
          timeout: PERSIST_TIMEOUT_MS,
        })
        .toContain(storedUrl);
      expect(await storedContent(owner, note.id)).not.toContain(pastedUrl);
    } finally {
      await owner.page.unroute(importRoute(note.id), answerAsBlobStore);
      await owner.page.unroute(storedImages, serveStoredImage);
    }
  });

  test('keeps an image it cannot copy as a link to where it came from', async ({
    sharing,
    imageOrigin,
  }) => {
    const { owner } = sharing;
    const note = await owner.createNote('Pasted image fallback');
    const pastedUrl = imageOrigin.url(MISSING_IMAGE_PATH);
    const editor = await openNote(owner, note.id);
    const refusal = owner.page.waitForResponse(
      (response) =>
        response.url() === importRoute(note.id) &&
        response.request().method() === 'POST'
    );

    await pasteHtml(editor, `<img src="${pastedUrl}" alt="${PASTED_ALT}">`);

    const response = await refusal;
    expect(response.status()).toBe(REFUSED_STATUS);
    expect(refusalSchema.parse(await response.json())).toEqual({
      code: 'fetch_failed',
    });
    expect(imageOrigin.fetchesByApi(MISSING_IMAGE_PATH)).toBe(1);
    await expect(
      editor.getByRole('link', { name: PASTED_ALT })
    ).toHaveAttribute('href', pastedUrl);
    await expect(owner.page.getByText(IMPORT_FAILED_TOAST_RE)).toBeVisible();
  });
});
