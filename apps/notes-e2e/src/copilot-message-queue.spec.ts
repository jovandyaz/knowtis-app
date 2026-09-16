import { expect, type Page } from '@playwright/test';

import {
  openCopilotDock,
  scriptAgent,
  type ScriptedAgent,
} from './fixtures/copilot.fixture';
import { test } from './fixtures/sharing.fixture';

const QUEUED_RE = /queued|en cola/i;
const SEND_NOW_RE = /send now|enviar ahora/i;
const STOP_RE = /^(stop|detener)$/i;
const BUSY_HINT_RE = /enter queues|enter encola/i;
const PAUSED_HINT_RE = /resumes the queue|reanuda la cola/i;

const FIRST_QUESTION = 'Resume esta nota';
const FIRST_ANSWER = 'Primera respuesta en curso.';
const PHONE_VIEWPORT = { width: 390, height: 844 };

const DONE = {
  usage: { inputTokens: 1, outputTokens: 1, model: 'm', costUsd: 0 },
  sources: [],
  knownNotes: [],
  webSources: [],
  stopReason: 'completed',
};

interface SentMessage {
  message: { content: string };
  noteId?: string;
}

function messagesSent(agent: ScriptedAgent): SentMessage[] {
  return agent.sent
    .filter((item) => item.event === 'agent:message')
    .map((item) => item.payload as SentMessage);
}

function sentTexts(agent: ScriptedAgent): string[] {
  return messagesSent(agent).map((item) => item.message.content);
}

function cancelCount(agent: ScriptedAgent): number {
  return agent.sent.filter((item) => item.event === 'agent:cancel').length;
}

/** The script streams a chunk and never ends the turn; each test ends it. */
function startAnsweringTurn(page: Page) {
  return scriptAgent(page, {
    onMessage: [['agent:chunk', { text: FIRST_ANSWER }]],
  });
}

async function askFirstQuestion(page: Page, agent: ScriptedAgent) {
  const composer = await openCopilotDock(page);
  await composer.fill(FIRST_QUESTION);
  await page.keyboard.press('Enter');
  await agent.waitForSent('agent:message');
  await expect(page.getByText(FIRST_ANSWER)).toBeVisible();
  return composer;
}

test('queues two messages while the copilot answers and drains them in order', async ({
  sharing,
}) => {
  const { owner } = sharing;
  const note = await owner.createNote('Cola de mensajes');
  const agent = await startAnsweringTurn(owner.page);

  await owner.page.goto(`/notes/${note.id}`);
  const composer = await askFirstQuestion(owner.page, agent);
  await expect(owner.page.getByText(BUSY_HINT_RE)).toBeVisible();

  const queuedTexts = ['Ahora tradúcela al inglés', 'Y luego resume el inglés'];
  for (const text of queuedTexts) {
    await composer.fill(text);
    await owner.page.keyboard.press('Enter');
  }

  await expect(composer).toHaveValue('');
  const queued = owner.page.getByRole('list', { name: QUEUED_RE });
  await expect(queued.getByRole('listitem')).toHaveCount(2);
  await expect(queued).toContainText(queuedTexts[0]);
  await expect(queued).toContainText(queuedTexts[1]);
  expect(sentTexts(agent)).toEqual([FIRST_QUESTION]);

  agent.emit('agent:done', DONE);

  await expect
    .poll(() => sentTexts(agent))
    .toEqual([FIRST_QUESTION, queuedTexts[0]]);
  await expect(queued.getByRole('listitem')).toHaveCount(1);
  expect(messagesSent(agent).at(-1)?.noteId).toBe(note.id);

  agent.emit('agent:done', DONE);

  await expect
    .poll(() => sentTexts(agent))
    .toEqual([FIRST_QUESTION, ...queuedTexts]);
  await expect(queued).toHaveCount(0);
  expect(cancelCount(agent)).toBe(0);
});

test('Send now and ⌘+Enter interrupt the live turn instead of queueing behind it', async ({
  sharing,
}) => {
  const { owner } = sharing;
  const note = await owner.createNote('Cola interrumpida');
  const agent = await startAnsweringTurn(owner.page);

  await owner.page.goto(`/notes/${note.id}`);
  const composer = await askFirstQuestion(owner.page, agent);

  const queuedTexts = ['Primera en cola', 'Segunda en cola'];
  for (const text of queuedTexts) {
    await composer.fill(text);
    await owner.page.keyboard.press('Enter');
  }
  const queued = owner.page.getByRole('list', { name: QUEUED_RE });
  await expect(queued.getByRole('listitem')).toHaveCount(2);

  await queued
    .getByRole('listitem')
    .filter({ hasText: queuedTexts[1] })
    .getByRole('button', { name: SEND_NOW_RE })
    .click();

  await expect
    .poll(() => sentTexts(agent))
    .toEqual([FIRST_QUESTION, queuedTexts[1]]);
  expect(cancelCount(agent)).toBe(1);
  await expect(queued.getByRole('listitem')).toHaveCount(1);
  await expect(queued).toContainText(queuedTexts[0]);

  await composer.fill('Esto va ya mismo');
  await composer.press('ControlOrMeta+Enter');

  await expect
    .poll(() => sentTexts(agent))
    .toEqual([FIRST_QUESTION, queuedTexts[1], 'Esto va ya mismo']);
  expect(cancelCount(agent)).toBe(2);
  await expect(queued.getByRole('listitem')).toHaveCount(1);
  await expect(queued).toContainText(queuedTexts[0]);
});

test('Stop pauses the queue and ↑ takes the newest message back into the composer', async ({
  sharing,
}) => {
  const { owner } = sharing;
  const note = await owner.createNote('Cola en pausa');
  const agent = await startAnsweringTurn(owner.page);

  await owner.page.goto(`/notes/${note.id}`);
  const composer = await askFirstQuestion(owner.page, agent);

  await composer.fill('Segundo mensaje');
  await owner.page.keyboard.press('Enter');
  const queued = owner.page.getByRole('list', { name: QUEUED_RE });
  await expect(queued.getByRole('listitem')).toHaveCount(1);

  await owner.page.getByRole('button', { name: STOP_RE }).click();

  await agent.waitForSent('agent:cancel');
  await expect(owner.page.getByText(PAUSED_HINT_RE)).toBeVisible();
  await expect(queued.getByRole('listitem')).toHaveCount(1);
  expect(sentTexts(agent)).toEqual([FIRST_QUESTION]);

  await composer.press('ArrowUp');

  await expect(composer).toHaveValue('Segundo mensaje');
  await expect(queued).toHaveCount(0);
  expect(sentTexts(agent)).toEqual([FIRST_QUESTION]);
});

test('on a phone, Escape stops the turn before it closes the copilot', async ({
  sharing,
}) => {
  const { owner } = sharing;
  const note = await owner.createNote('Cola en el teléfono');
  const agent = await startAnsweringTurn(owner.page);
  const desktopViewport = owner.page.viewportSize();
  await owner.page.setViewportSize(PHONE_VIEWPORT);

  try {
    await owner.page.goto(`/notes/${note.id}`);
    const composer = await askFirstQuestion(owner.page, agent);

    await composer.press('Escape');

    await agent.waitForSent('agent:cancel');
    await expect(composer).toBeVisible();
    await expect(owner.page.getByText(FIRST_ANSWER)).toBeVisible();

    await composer.press('Escape');

    await expect(composer).toHaveCount(0);
  } finally {
    if (desktopViewport) {
      await owner.page.setViewportSize(desktopViewport);
    }
  }
});
