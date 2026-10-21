import { expect, type Locator, type Page } from '@playwright/test';

import { openCopilotDock, scriptAgent } from './fixtures/copilot.fixture';
import {
  BENIGN_TEXT,
  CANARY_HOST,
  clickEveryLink,
  DRAW_TIME_PROPOSAL_HTML,
  enforceCsp,
  HOSTILE_MARKDOWN,
  HOSTILE_MERMAID_COUNT,
  HOSTILE_PROPOSAL_HTML,
  productionImgSrc,
  SCHEME_STRIPPED_ANSWER,
  SCHEME_STRIPPED_LINK_TEXT,
  STORED_IMAGE_ALT,
  test,
  watchCspViolations,
} from './fixtures/render-canary.fixture';
import { scriptSocket } from './fixtures/scripted-socket.fixture';

const PROPOSAL_ID = '11111111-2222-3333-4444-666666666666';
const CREATE_TITLE_RE = /create note|crear nota/i;
const REVIEW_TITLE_RE = /review changes|revisar cambios/i;
const ASK_AI_LABEL = 'Ask AI';
const CONTINUE_WRITING_RE = /^Continue writing/;
const DIAGRAM_SELECTOR = '.mermaid-preview-area svg';
const ASSISTANT_MESSAGE_SELECTOR = '.is-assistant';
const EDITOR_SELECTOR = '.tiptap';
const NOTE_WORD = 'gamma';
const QUESTION = 'Resume mis notas del viaje';
const DONE = {
  usage: { inputTokens: 1, outputTokens: 1, model: 'm', costUsd: 0 },
  sources: [],
  knownNotes: [],
  webSources: [],
  stopReason: 'completed',
};
const CANARY_IMG_SRC_VIOLATION = `img-src https://${CANARY_HOST}/`;
const AI_USAGE = { inputTokens: 1, outputTokens: 1, model: 'm', costUsd: 0 };

async function ask(page: Page, noteId: string) {
  await page.goto(`/notes/${noteId}`);
  const composer = await openCopilotDock(page);
  await composer.fill(QUESTION);
  await page.keyboard.press('Enter');
}

function assistantAnswer(page: Page): Locator {
  return page
    .locator(ASSISTANT_MESSAGE_SELECTOR)
    .filter({ hasText: BENIGN_TEXT });
}

async function expectDiagrams(region: Locator, count: number) {
  await expect(region.locator(DIAGRAM_SELECTOR)).toHaveCount(count);
}

test('a hostile chat answer loads nothing and its links open nothing on a plain click', async ({
  sharing,
  foreignRequests,
}) => {
  const { owner } = sharing;
  const note = await owner.createNote('Canary chat');
  const agent = await scriptAgent(owner.page, {
    onMessage: [
      ['agent:chunk', { text: HOSTILE_MARKDOWN }],
      ['agent:done', DONE],
    ],
  });

  await ask(owner.page, note.id);
  await agent.waitForSent('agent:message');
  const answer = assistantAnswer(owner.page);
  await expect(
    answer.getByRole('img', { name: STORED_IMAGE_ALT })
  ).toBeVisible();
  await answer.evaluate((element) => element.scrollIntoView({ block: 'end' }));
  await foreignRequests.probe(owner.page);

  expect(foreignRequests.urls).toEqual(foreignRequests.probeOnly);
  const clicks = await clickEveryLink(owner.page, answer);
  expect(clicks.navigations).toEqual([]);
  expect(clicks.clicked).toBeGreaterThan(0);
  expect(foreignRequests.urls).toEqual(foreignRequests.probeOnly);
});

test('a chat link whose scheme the chat strips opens nothing on a plain click', async ({
  sharing,
  foreignRequests,
}) => {
  const { owner } = sharing;
  const note = await owner.createNote('Canary stripped link');
  const agent = await scriptAgent(owner.page, {
    onMessage: [
      ['agent:chunk', { text: SCHEME_STRIPPED_ANSWER }],
      ['agent:done', DONE],
    ],
  });

  await ask(owner.page, note.id);
  await agent.waitForSent('agent:message');
  const answer = assistantAnswer(owner.page);
  await expect(answer.getByText(SCHEME_STRIPPED_LINK_TEXT)).toBeVisible();

  const clicks = await clickEveryLink(owner.page, answer);
  expect(clicks.navigations).toEqual([]);
  expect(clicks.clicked).toBe(1);
  expect(foreignRequests.urls).toEqual([]);
});

test('a hostile proposal card and its diagrams load nothing and its links open nothing on a plain click', async ({
  sharing,
  foreignRequests,
}) => {
  const { owner } = sharing;
  const note = await owner.createNote('Canary card');
  const agent = await scriptAgent(owner.page, {
    onMessage: [
      [
        'agent:proposal',
        {
          id: PROPOSAL_ID,
          kind: 'create',
          targetNoteId: null,
          summary: 'Create note "Trip"',
          payload: { title: 'Trip', contentHtml: HOSTILE_PROPOSAL_HTML },
        },
      ],
    ],
  });

  await ask(owner.page, note.id);
  await agent.waitForSent('agent:message');
  const card = owner.page.getByRole('group', { name: CREATE_TITLE_RE });
  const preview = card.getByTestId('proposal-preview');
  await expect(preview.getByText(BENIGN_TEXT)).toBeVisible();
  await expect(
    preview.getByRole('img', { name: STORED_IMAGE_ALT })
  ).toBeVisible();
  await expectDiagrams(preview, HOSTILE_MERMAID_COUNT);
  await foreignRequests.probe(owner.page);

  expect(foreignRequests.urls).toEqual(foreignRequests.probeOnly);
  const clicks = await clickEveryLink(owner.page, preview);
  expect(clicks.navigations).toEqual([]);
  expect(clicks.clicked).toBeGreaterThan(0);
  expect(foreignRequests.urls).toEqual(foreignRequests.probeOnly);
});

test('a hostile proposed update loads nothing in the review diff and its links open nothing on a plain click', async ({
  sharing,
  foreignRequests,
}) => {
  const { owner } = sharing;
  const note = await owner.createNote('Canary review');
  await owner.update(note.id, { content: '<p>Old plan</p>' });
  const agent = await scriptAgent(owner.page, {
    onMessage: [
      [
        'agent:proposal',
        {
          id: PROPOSAL_ID,
          kind: 'update',
          targetNoteId: note.id,
          summary: 'Update "Canary review": content updated',
          payload: { contentHtml: HOSTILE_PROPOSAL_HTML },
        },
      ],
    ],
  });

  await ask(owner.page, note.id);
  await agent.waitForSent('agent:message');
  const diff = owner.page
    .getByRole('group', { name: REVIEW_TITLE_RE })
    .getByTestId('review-diff');
  await expect(diff.getByText(BENIGN_TEXT)).toBeVisible();
  await expect(diff.getByRole('img', { name: STORED_IMAGE_ALT })).toBeVisible();
  await expectDiagrams(diff, HOSTILE_MERMAID_COUNT);
  await foreignRequests.probe(owner.page);

  expect(foreignRequests.urls).toEqual(foreignRequests.probeOnly);
  const clicks = await clickEveryLink(owner.page, diff);
  expect(clicks.navigations).toEqual([]);
  expect(clicks.clicked).toBeGreaterThan(0);
  expect(foreignRequests.urls).toEqual(foreignRequests.probeOnly);
});

test('the production img-src CSP stops what Mermaid fetches while it draws', async ({
  sharing,
  foreignRequests,
}) => {
  const { owner } = sharing;
  const note = await owner.createNote('Canary draw-time');
  const csp = await enforceCsp(owner.page, await productionImgSrc());
  try {
    const agent = await scriptAgent(owner.page, {
      onMessage: [
        [
          'agent:proposal',
          {
            id: PROPOSAL_ID,
            kind: 'create',
            targetNoteId: null,
            summary: 'Create note "Trip"',
            payload: { title: 'Trip', contentHtml: DRAW_TIME_PROPOSAL_HTML },
          },
        ],
      ],
    });

    await owner.page.goto(`/notes/${note.id}`);
    const violations = await watchCspViolations(owner.page);
    const composer = await openCopilotDock(owner.page);
    await composer.fill(QUESTION);
    await owner.page.keyboard.press('Enter');
    await agent.waitForSent('agent:message');
    const preview = owner.page
      .getByRole('group', { name: CREATE_TITLE_RE })
      .getByTestId('proposal-preview');
    await expect(preview.getByText(BENIGN_TEXT)).toBeVisible();
    await expect.poll(violations).not.toEqual([]);
    await foreignRequests.probe(owner.page);

    expect(foreignRequests.urls).toEqual(foreignRequests.probeOnly);
    expect(
      (await violations()).filter(
        (violation) => !violation.startsWith(CANARY_IMG_SRC_VIOLATION)
      )
    ).toEqual([]);
  } finally {
    await csp.dispose();
  }
});

test('a hostile Ask-AI preview loads nothing and its links open nothing on a plain click', async ({
  sharing,
  foreignRequests,
}) => {
  const { owner } = sharing;
  const note = await owner.createNote('Canary Ask AI');
  await owner.update(note.id, { content: `<p>alpha beta ${NOTE_WORD}</p>` });
  const ai = await scriptSocket(owner.page, '/ai', {
    'ai:complete': [
      ['ai:chunk', { text: HOSTILE_MARKDOWN }],
      ['ai:done', { usage: AI_USAGE }],
    ],
  });

  await owner.page.goto(`/notes/${note.id}`);
  const editor = owner.page.locator(EDITOR_SELECTOR);
  await expect(editor).toHaveAttribute('contenteditable', 'true');
  await editor.getByText(NOTE_WORD).click();
  await owner.page.keyboard.press('End');
  await owner.page
    .getByRole('button', { name: ASK_AI_LABEL, exact: true })
    .click();
  await owner.page
    .getByRole('dialog')
    .getByRole('button', { name: CONTINUE_WRITING_RE })
    .click();
  await ai.waitForSent('ai:complete');
  const completion = owner.page
    .locator('[aria-live="polite"]')
    .filter({ hasText: BENIGN_TEXT });
  await expect(
    completion.getByRole('img', { name: STORED_IMAGE_ALT })
  ).toBeVisible();
  await foreignRequests.probe(owner.page);

  expect(foreignRequests.urls).toEqual(foreignRequests.probeOnly);
  const clicks = await clickEveryLink(owner.page, completion);
  expect(clicks.navigations).toEqual([]);
  expect(clicks.clicked).toBeGreaterThan(0);
  expect(foreignRequests.urls).toEqual(foreignRequests.probeOnly);
});
