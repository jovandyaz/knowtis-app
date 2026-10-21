import { expect, type Locator, type Page } from '@playwright/test';
import { z } from 'zod';

import { AI_ACTION } from '@knowtis/shared-types';

import {
  releaseScriptedSockets,
  scriptSocket,
} from './fixtures/scripted-socket.fixture';
import {
  test as sharingTest,
  type SharingActor,
} from './fixtures/sharing.fixture';

const AI_NAMESPACE = '/ai';
const EDITOR_SELECTOR = '.tiptap';
const PARAGRAPH_SELECTOR = `${EDITOR_SELECTOR} > p`;
// A remote caret is a widget holding the collaborator's name, which
// textContent would otherwise read as note text.
const WIDGET_SELECTOR = '.ProseMirror-widget';
const ASK_AI_LABEL = 'Ask AI';
const IMPROVE_WRITING_RE = /^Improve writing/;
const REPLACE_LABEL = 'Replace';
const USAGE = { inputTokens: 1, outputTokens: 1, model: 'm', costUsd: 0 };

const FIRST = 'alpha beta gamma';
const SECOND = 'delta epsilon';
const THIRD = 'zeta eta theta';
const REMOTE_PREFIX = 'Remote ';
const REWRITE = 'BETA';
const OTHER_NOTE_TITLE = 'AI preview elsewhere';
const OTHER_NOTE_TEXT = 'Another note whose body is longer than the first one';

const completionRequestSchema = z.object({
  action: z.literal(AI_ACTION.IMPROVE_WRITING),
  selection: z.string(),
});

interface TextPoint {
  text: string;
  offset: number;
}

const test = sharingTest.extend<{ scriptedSockets: true }>({
  scriptedSockets: [
    // eslint-disable-next-line no-empty-pattern -- Playwright requires a destructured fixture dependency list.
    async ({}, use) => {
      try {
        await use(true);
      } finally {
        await releaseScriptedSockets();
      }
    },
    { auto: true },
  ],
});

function before(text: string): TextPoint {
  return { text, offset: 0 };
}

function after(text: string): TextPoint {
  return { text, offset: text.length };
}

function paragraphsHtml(...paragraphs: string[]): string {
  return paragraphs.map((paragraph) => `<p>${paragraph}</p>`).join('');
}

function scriptEditorAI(page: Page) {
  return scriptSocket(page, AI_NAMESPACE, {
    'ai:complete': [
      ['ai:chunk', { text: REWRITE }],
      ['ai:done', { usage: USAGE }],
    ],
  });
}

function paragraphs(page: Page): Promise<string[]> {
  return page.locator(PARAGRAPH_SELECTOR).evaluateAll(
    (nodes, widget) =>
      nodes.map((paragraph) => {
        const walker = document.createTreeWalker(
          paragraph,
          NodeFilter.SHOW_TEXT
        );
        let text = '';
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
          if (!node.parentElement?.closest(widget)) {
            text += node.textContent ?? '';
          }
        }
        return text;
      }),
    WIDGET_SELECTOR
  );
}

async function expectParagraphs(page: Page, expected: string[]) {
  await expect.poll(() => paragraphs(page)).toEqual(expected);
}

async function openNote(
  actor: SharingActor,
  noteId: string,
  expected: string[]
) {
  await actor.page.goto(`/notes/${noteId}`);
  const editor = actor.page.locator(EDITOR_SELECTOR);
  await expect(editor).toHaveAttribute('contenteditable', 'true');
  await expectParagraphs(actor.page, expected);
  return editor;
}

/** Selects from `anchor` to `head` through the DOM, without the pointer press
 * that would dismiss an open AI preview. Each point's text must sit in a single
 * text node, and a remote collaborator's selection highlight splits the words
 * it covers into nodes of their own. */
async function select(
  editor: Locator,
  anchor: TextPoint,
  head: TextPoint = anchor
) {
  await editor.focus();
  await editor.evaluate(
    (root, points) => {
      const locate = ({ text, offset }: TextPoint) => {
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
          const index = node.parentElement?.closest(points.widget)
            ? -1
            : (node.textContent ?? '').indexOf(text);
          if (index >= 0) {
            return { node, offset: index + offset };
          }
        }
        throw new Error(`"${text}" is not in one text node of the editor`);
      };
      const from = locate(points.anchor);
      const to = locate(points.head);
      document
        .getSelection()
        ?.setBaseAndExtent(from.node, from.offset, to.node, to.offset);
    },
    { anchor, head, widget: WIDGET_SELECTOR }
  );
}

async function improveSelection(page: Page) {
  await page.getByRole('button', { name: ASK_AI_LABEL, exact: true }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: IMPROVE_WRITING_RE })
    .click();
}

function replaceButton(page: Page) {
  return page.getByRole('button', { name: REPLACE_LABEL, exact: true });
}

async function shareWithCollaborator(
  owner: SharingActor,
  collaborator: SharingActor,
  paragraphTexts: string[]
) {
  const note = await owner.createNote('AI preview under collaboration');
  await owner.update(note.id, { content: paragraphsHtml(...paragraphTexts) });
  await owner.share(note.id, collaborator.email, 'editor');
  return note;
}

test('replaces only the selected word after a collaborator types before it', async ({
  sharing,
}) => {
  const { owner, editor: collaborator } = sharing;
  const original = [FIRST, SECOND];
  const note = await shareWithCollaborator(owner, collaborator, original);
  const ai = await scriptEditorAI(owner.page);
  const ownerEditor = await openNote(owner, note.id, original);
  const collaboratorEditor = await openNote(collaborator, note.id, original);

  await select(ownerEditor, before('beta'), after('beta'));
  await improveSelection(owner.page);
  const request = completionRequestSchema.parse(
    await ai.waitForSent('ai:complete')
  );
  expect(request.selection).toBe('beta');
  await expect(replaceButton(owner.page)).toBeVisible();

  await select(collaboratorEditor, before('alpha'));
  await collaborator.page.keyboard.insertText(REMOTE_PREFIX);
  await expectParagraphs(owner.page, [`${REMOTE_PREFIX}${FIRST}`, SECOND]);

  await replaceButton(owner.page).click();

  const replaced = [`${REMOTE_PREFIX}alpha ${REWRITE} gamma`, SECOND];
  await expectParagraphs(owner.page, replaced);
  await expectParagraphs(collaborator.page, replaced);
});

test('keeps everything outside the selection when a collaborator deletes the paragraph it starts in', async ({
  sharing,
}) => {
  const { owner, editor: collaborator } = sharing;
  const original = [FIRST, SECOND, THIRD];
  const note = await shareWithCollaborator(owner, collaborator, original);
  const ai = await scriptEditorAI(owner.page);
  const ownerEditor = await openNote(owner, note.id, original);
  const collaboratorEditor = await openNote(collaborator, note.id, original);

  await select(ownerEditor, before('beta'), after('delta'));
  await improveSelection(owner.page);
  const request = completionRequestSchema.parse(
    await ai.waitForSent('ai:complete')
  );
  expect(request.selection).toBe('beta gamma delta');
  await expect(replaceButton(owner.page)).toBeVisible();

  await select(collaboratorEditor, before('alpha'), before('delta'));
  await collaborator.page.keyboard.press('Backspace');
  await expectParagraphs(owner.page, [SECOND, THIRD]);

  await replaceButton(owner.page).click();

  // The selection's start went with the deleted paragraph, so the rewrite lands
  // at its surviving end instead of deleting up to wherever that start was.
  const replaced = [`delta${REWRITE} epsilon`, THIRD];
  await expectParagraphs(owner.page, replaced);
  await expectParagraphs(collaborator.page, replaced);
});

test('drops an open preview when the user moves to another note', async ({
  sharing,
}) => {
  const { owner } = sharing;
  const note = await owner.createNote('AI preview origin');
  await owner.update(note.id, { content: paragraphsHtml(FIRST) });
  const other = await owner.createNote(OTHER_NOTE_TITLE);
  await owner.update(other.id, { content: paragraphsHtml(OTHER_NOTE_TEXT) });
  const ai = await scriptEditorAI(owner.page);
  const ownerEditor = await openNote(owner, note.id, [FIRST]);

  await select(ownerEditor, before('beta'), after('beta'));
  await improveSelection(owner.page);
  await ai.waitForSent('ai:complete');
  await expect(replaceButton(owner.page)).toBeVisible();

  await owner.page
    .getByRole('link', { name: OTHER_NOTE_TITLE, exact: true })
    .click();
  await expect(owner.page).toHaveURL(new RegExp(`/notes/${other.id}$`));
  await expect(owner.page.locator(EDITOR_SELECTOR)).toHaveAttribute(
    'contenteditable',
    'true'
  );
  await expectParagraphs(owner.page, [OTHER_NOTE_TEXT]);
  await expect(replaceButton(owner.page)).toHaveCount(0);
});
