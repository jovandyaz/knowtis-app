import { expect, type Page } from '@playwright/test';

import { test } from './fixtures/conversations.fixture';
import {
  openCopilotDock,
  scriptAgent,
  type ScriptedAgent,
} from './fixtures/copilot.fixture';

const RECENT_RE = /^(recent conversations|conversaciones recientes)$/i;
const RENAME_RE = /^(rename|cambiar nombre)$/i;
const DELETE_RE = /^(delete|eliminar)$/i;
const TITLE_FIELD_RE = /^(conversation title|título de la conversación)$/i;
const TRANSCRIPT_ROUTE_RE = /\/agent\/conversations\/[^/]+\/messages$/;

const NOTE_TITLE = 'Viaje a Oaxaca';
const TITLE = 'Itinerario de cinco días';
const RENAMED = 'Oaxaca en cinco días';
const MESSAGES = [
  { role: 'user', content: 'Arma un itinerario de cinco días' },
  { role: 'assistant', content: 'Día uno: Centro Histórico y Santo Domingo.' },
  { role: 'user', content: 'Agrega un mercado por día' },
] as const;

const DONE = {
  usage: { inputTokens: 1, outputTokens: 1, model: 'm', costUsd: 0 },
  sources: [],
  knownNotes: [],
  webSources: [],
  stopReason: 'completed',
};

function openLabel(title: string): RegExp {
  const escaped = title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(
    `^(open conversation|abrir la conversación) ${escaped}$`,
    'i'
  );
}

function messagesSent(agent: ScriptedAgent): { conversationId?: string }[] {
  return agent.sent
    .filter((item) => item.event === 'agent:message')
    .map((item) => item.payload as { conversationId?: string });
}

async function expectThread(page: Page) {
  for (const message of MESSAGES) {
    await expect(
      page.getByText(message.content, { exact: true })
    ).toBeVisible();
  }
}

test('lists, opens, keeps across a reload, renames and deletes a conversation', async ({
  sharing,
  conversations,
}) => {
  const { owner } = sharing;
  const note = await owner.createNote(NOTE_TITLE);
  await conversations.seed({
    userId: owner.id,
    noteId: note.id,
    title: TITLE,
    messages: MESSAGES,
  });

  await owner.page.goto(`/notes/${note.id}`);
  await openCopilotDock(owner.page);
  await owner.page.getByRole('button', { name: RECENT_RE }).click();
  const item = owner.page.getByRole('menuitemradio', {
    name: openLabel(TITLE),
  });
  await expect(item).toContainText(NOTE_TITLE);
  await item.click();
  await expectThread(owner.page);

  await owner.page.reload();
  await openCopilotDock(owner.page);
  await expectThread(owner.page);

  await owner.page.getByRole('button', { name: TITLE, exact: true }).click();
  await owner.page.getByRole('menuitem', { name: RENAME_RE }).click();
  const field = owner.page.getByRole('textbox', { name: TITLE_FIELD_RE });
  await expect(field).toBeFocused();
  await field.fill(RENAMED);
  await field.press('Enter');
  const renamed = owner.page.getByRole('button', {
    name: RENAMED,
    exact: true,
  });
  await expect(renamed).toBeVisible();
  await renamed.click();
  await expect(
    owner.page.getByRole('menuitemradio', { name: openLabel(RENAMED) })
  ).toBeVisible();

  await owner.page.getByRole('menuitem', { name: DELETE_RE }).click();
  await owner.page
    .getByRole('dialog')
    .getByRole('button', { name: DELETE_RE })
    .click();
  await expect(
    owner.page.getByText(MESSAGES[0].content, { exact: true })
  ).toHaveCount(0);
  await owner.page.getByRole('button', { name: RECENT_RE }).click();
  await expect(
    owner.page.getByRole('menuitemradio', { name: openLabel(RENAMED) })
  ).toHaveCount(0);
  await owner.page.keyboard.press('Escape');
});

test('a reload resumes the thread the copilot announced', async ({
  sharing,
  conversations,
}) => {
  const { owner } = sharing;
  const note = await owner.createNote('Hilo que sobrevive');
  const conversationId = await conversations.seed({
    userId: owner.id,
    noteId: note.id,
    title: 'Primera pregunta',
    messages: [
      { role: 'user', content: 'Primera pregunta' },
      { role: 'assistant', content: 'Primera respuesta guardada.' },
    ],
  });
  const agent = await scriptAgent(owner.page, {
    onMessage: [
      ['agent:conversation', { conversationId }],
      ['agent:chunk', { text: 'Respuesta en vivo.' }],
      ['agent:done', { ...DONE, conversationId }],
    ],
  });

  await owner.page.goto(`/notes/${note.id}`);
  const composer = await openCopilotDock(owner.page);
  await composer.fill('Primera pregunta');
  await owner.page.keyboard.press('Enter');
  await expect(owner.page.getByText('Respuesta en vivo.')).toBeVisible();
  expect(messagesSent(agent)[0]?.conversationId).toBeUndefined();

  await owner.page.reload();
  const composerAfterReload = await openCopilotDock(owner.page);
  await expect(
    owner.page.getByText('Primera respuesta guardada.')
  ).toBeVisible();
  await composerAfterReload.fill('Segunda pregunta');
  await owner.page.keyboard.press('Enter');

  await expect.poll(() => messagesSent(agent).length).toBe(2);
  expect(messagesSent(agent)[1]?.conversationId).toBe(conversationId);
});

test('a message sent while the thread loads continues it', async ({
  sharing,
  conversations,
}) => {
  const { owner } = sharing;
  const title = 'Pregunta guardada';
  const note = await owner.createNote('Hilo que tarda en llegar');
  const conversationId = await conversations.seed({
    userId: owner.id,
    noteId: note.id,
    title,
    messages: [
      { role: 'user', content: title },
      { role: 'assistant', content: 'Respuesta guardada.' },
    ],
  });
  const agent = await scriptAgent(owner.page, {
    onMessage: [
      ['agent:chunk', { text: 'Seguimos en el mismo hilo.' }],
      ['agent:done', { ...DONE, conversationId }],
    ],
  });
  await owner.page.goto(`/notes/${note.id}`);
  await openCopilotDock(owner.page);
  await owner.page.getByRole('button', { name: RECENT_RE }).click();
  await owner.page
    .getByRole('menuitemradio', { name: openLabel(title) })
    .click();
  await expect(owner.page.getByText('Respuesta guardada.')).toBeVisible();

  let releaseTranscript: () => void = () => undefined;
  const transcriptHeld = new Promise<void>((resolve) => {
    releaseTranscript = resolve;
  });
  await owner.page.route(TRANSCRIPT_ROUTE_RE, async (route) => {
    await transcriptHeld;
    await route.continue();
  });
  try {
    await owner.page.reload();
    const composer = await openCopilotDock(owner.page);
    await composer.fill('Mientras carga');
    await owner.page.keyboard.press('Enter');

    await expect(
      owner.page.getByText('Seguimos en el mismo hilo.')
    ).toBeVisible();
    expect(messagesSent(agent).map((item) => item.conversationId)).toEqual([
      conversationId,
    ]);
  } finally {
    releaseTranscript();
  }
});
