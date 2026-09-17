import { expect, type Page } from '@playwright/test';

import { scriptAgent } from './fixtures/copilot.fixture';
import { test } from './fixtures/sharing.fixture';

const NOTE_HTML = [
  '<h1>Landing de agencia</h1>',
  '<h2>Stack</h2>',
  '<ul><li><p>Astro + Vite como base</p></li>',
  '<li><p>React + TypeScript para componentes interactivos</p></li></ul>',
  '<h2>Deploy</h2>',
  '<p>Cloudflare Pages: recomendado por su rendimiento global.</p>',
  '<p>Alternativa: Vercel si se prioriza el despliegue simple.</p>',
].join('');

const PROPOSED_HTML = [
  '<h1>Landing de agencia</h1>',
  '<p>Objetivo: convertir visitantes en prospectos.</p>',
  '<h2>Stack</h2>',
  '<ul><li><p>Astro + Vite como base del sitio estatico</p></li>',
  '<li><p>React + TypeScript para componentes interactivos</p></li></ul>',
  '<h2>Deploy</h2>',
  '<p>Cloudflare Pages: recomendado por su rendimiento global.</p>',
].join('');

const PROPOSAL_ID = '11111111-2222-3333-4444-555555555555';

const INSERTED_PARAGRAPH = 'Objetivo: convertir visitantes en prospectos.';
const REMOVED_PARAGRAPH =
  'Alternativa: Vercel si se prioriza el despliegue simple.';
const SURVIVING_PARAGRAPH =
  'Cloudflare Pages: recomendado por su rendimiento global.';

const REVIEW_TITLE_RE = /review changes|revisar cambios/i;
const REMOVED_BLOCK_RE = /1 block removed|1 bloque eliminado/i;
const REASON_TEXTBOX_RE = /why\?|por qué/i;
const COMPOSER_RE = /copilot|pregunta|ask/i;

/** The dock's open state persists across notes in the same worker, so right
 * after navigation the composer may just not have hydrated yet — an
 * `isVisible()` snapshot can't tell that from "closed" and toggling a dock
 * that is actually open closes it. Waiting bounds the hydration race instead. */
async function openCopilotDock(page: Page) {
  const composer = page.getByRole('textbox', { name: COMPOSER_RE }).first();
  const alreadyOpen = await composer
    .waitFor({ state: 'visible', timeout: 1_000 })
    .then(() => true)
    .catch(() => false);
  if (!alreadyOpen) {
    await page
      .getByRole('button', { name: /copilot/i })
      .first()
      .click();
  }
  return composer;
}

test('reviews a proposed note update before applying it', async ({
  sharing,
}) => {
  const { owner } = sharing;
  const note = await owner.createNote('Landing de agencia');
  await owner.update(note.id, { content: NOTE_HTML });

  const agent = await scriptAgent(owner.page, {
    onMessage: [
      ['agent:chunk', { text: 'Propongo una reescritura.' }],
      [
        'agent:proposal',
        {
          id: PROPOSAL_ID,
          kind: 'update',
          targetNoteId: note.id,
          summary: 'Update "Landing de agencia": title, content updated',
          previewHtml: PROPOSED_HTML,
          payload: {
            title: 'Landing de agencia — Especificacion tecnica',
            contentHtml: PROPOSED_HTML,
          },
        },
      ],
    ],
    onApprove: [
      [
        'agent:committed',
        {
          proposalId: PROPOSAL_ID,
          result: {
            noteId: note.id,
            title: 'Landing de agencia — Especificacion tecnica',
            kind: 'update',
          },
        },
      ],
      ['agent:done', {}],
    ],
  });

  await owner.page.goto(`/notes/${note.id}`);
  await expect(
    owner.page.getByText('Astro + Vite como base', { exact: false }).first()
  ).toBeVisible();

  const composer = await openCopilotDock(owner.page);
  await composer.fill('Reescribe esta nota como especificacion tecnica');
  await owner.page.keyboard.press('Enter');
  await agent.waitForSent('agent:message');

  const review = owner.page.getByRole('group', { name: REVIEW_TITLE_RE });
  await expect(review).toBeVisible();

  // The server summary is never shown; the localized line is.
  await expect(
    owner.page.getByText('Update "Landing de agencia"', { exact: false })
  ).toHaveCount(0);
  await expect(review.getByTestId('review-title')).toContainText(
    'Especificacion tecnica'
  );

  await expect(
    review.locator('ins[data-change]', { hasText: INSERTED_PARAGRAPH })
  ).toBeVisible();
  await expect(
    review.getByRole('button', { name: REMOVED_BLOCK_RE })
  ).toBeVisible();
  await expect(review.getByText(REMOVED_PARAGRAPH)).toHaveCount(0);

  // The decorations live only in the review's own diff, never in the note
  // editor underneath — so the soon-to-be-deleted line is still there.
  await expect(
    owner.page.getByRole('main').getByText('Alternativa: Vercel', {
      exact: false,
    })
  ).toBeVisible();

  await review.getByRole('switch').click();
  await expect(
    review.locator('[data-change] del', { hasText: REMOVED_PARAGRAPH }).first()
  ).toBeVisible();

  const surviving = review.locator('p', { hasText: SURVIVING_PARAGRAPH });
  await expect(surviving).toHaveText(SURVIVING_PARAGRAPH);
  await expect(surviving.locator('[data-change]')).toHaveCount(0);

  // The review dock widens so the diff has room; a regression here would
  // silently shrink it back to chat width.
  const width = async () =>
    (await review.evaluate(
      (node) =>
        (node.closest('aside') as HTMLElement)?.getBoundingClientRect().width ??
        0
    )) as number;
  expect(await width()).toBeGreaterThan(560);

  await review.getByRole('button', { name: /apply|aplicar/i }).click();
  await agent.waitForSent('agent:approve');

  await expect(review).toHaveCount(0);
});

test('discards a proposed update with a reason', async ({ sharing }) => {
  const { owner } = sharing;
  const note = await owner.createNote('Nota descartable');
  await owner.update(note.id, { content: '<p>Contenido original</p>' });

  const agent = await scriptAgent(owner.page, {
    onMessage: [
      [
        'agent:proposal',
        {
          id: PROPOSAL_ID,
          kind: 'update',
          targetNoteId: note.id,
          summary: 'Update "Nota descartable": content updated',
          previewHtml: '<p>Contenido reescrito</p>',
          payload: { contentHtml: '<p>Contenido reescrito</p>' },
        },
      ],
    ],
    onReject: [
      ['agent:chunk', { text: 'Entendido.' }],
      ['agent:done', {}],
    ],
  });

  await owner.page.goto(`/notes/${note.id}`);
  const composer = await openCopilotDock(owner.page);
  await composer.fill('Reescribe la nota');
  await owner.page.keyboard.press('Enter');

  const review = owner.page.getByRole('group', { name: REVIEW_TITLE_RE });
  await expect(review).toBeVisible();
  await expect(review.getByTestId('review-title')).toHaveCount(0);

  await review.getByRole('button', { name: /dismiss|descartar/i }).click();
  // Tiptap sets role=textbox on its read-only ProseMirror root too, so an
  // unscoped textbox query here would be ambiguous with the diff preview.
  await review
    .getByRole('textbox', { name: REASON_TEXTBOX_RE })
    .fill('prefiero el original');
  await review.getByRole('button', { name: /send|enviar/i }).click();

  const rejected = (await agent.waitForSent('agent:reject')) as {
    reason?: string;
  };
  expect(rejected.reason).toBe('prefiero el original');
  await expect(review).toHaveCount(0);
});
