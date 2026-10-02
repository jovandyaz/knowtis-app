import { expect, type Locator } from '@playwright/test';
import { z } from 'zod';

import { MESSAGE_KIND } from '@knowtis/shared-types';

import { test } from './fixtures/conversations.fixture';
import {
  openCopilotDock,
  scriptAgent,
  type ScriptedAgent,
} from './fixtures/copilot.fixture';

const CONTINUE_RE = /^(continue|continuar)$/i;
const PARTIAL_RE = /^(partial answer|resultado parcial)$/i;
const THREAD_RE = /^(conversation|conversación)$/i;

const QUESTION = 'Compara mis notas de viaje con el presupuesto';
const FIRST_SEGMENT =
  'Revisé tus tres notas de viaje. Pendiente: el presupuesto.';
const SECOND_SEGMENT = 'Revisé el presupuesto. Pendiente: las fechas.';
const FOLLOW_UP = 'Con eso basta, gracias';
const FOLLOW_UP_ANSWER = 'Perfecto, aquí lo dejamos.';
const CHECKPOINT = 'max_steps';
const USAGE = { inputTokens: 1, outputTokens: 1, model: 'm', costUsd: 0 };

const sentTurnSchema = z.object({ turnId: z.string().min(1) });
const sentContinueSchema = z.strictObject({
  turnId: z.string().min(1),
  conversationId: z.string().min(1),
  continuesTurnId: z.string().min(1),
  noteId: z.string().min(1),
});

function done(turnId: string, conversationId: string, capped: boolean) {
  return {
    turnId,
    usage: USAGE,
    sources: [],
    knownNotes: [],
    webSources: [],
    stopReason: capped ? CHECKPOINT : 'completed',
    continuable: capped,
    conversationId,
  };
}

function messagesSent(agent: ScriptedAgent): unknown[] {
  return agent.sent
    .filter((item) => item.event === 'agent:message')
    .map((item) => item.payload);
}

async function nthMessageSent(agent: ScriptedAgent, count: number) {
  await expect.poll(() => messagesSent(agent).length).toBe(count);
  return messagesSent(agent)[count - 1];
}

function continueChips(thread: Locator): Locator {
  return thread.getByText(CONTINUE_RE).and(thread.locator(':not(button)'));
}

async function topsOf(...locators: Locator[]): Promise<number[]> {
  const boxes = await Promise.all(
    locators.map((locator) => locator.boundingBox())
  );
  return boxes.map((box) => box?.y ?? Number.NaN);
}

test('a capped answer continues on Continuar and keeps the offer on its last turn across a reload', async ({
  sharing,
  conversations,
}) => {
  const { owner } = sharing;
  const note = await owner.createNote('Viaje y presupuesto');
  const conversationId = await conversations.seed({
    userId: owner.id,
    noteId: note.id,
    title: QUESTION,
    messages: [
      { role: 'user', content: QUESTION },
      { role: 'assistant', content: FIRST_SEGMENT, stopReason: CHECKPOINT },
      { role: 'user', content: '', kind: MESSAGE_KIND.CONTINUE },
      { role: 'assistant', content: SECOND_SEGMENT, stopReason: CHECKPOINT },
    ],
  });
  const agent = await scriptAgent(owner.page, { onMessage: [] });

  await owner.page.goto(`/notes/${note.id}`);
  const composer = await openCopilotDock(owner.page);
  await composer.fill(QUESTION);
  await owner.page.keyboard.press('Enter');
  const question = sentTurnSchema.parse(await nthMessageSent(agent, 1));
  agent.emit('agent:conversation', { turnId: question.turnId, conversationId });
  agent.emit('agent:chunk', { turnId: question.turnId, text: FIRST_SEGMENT });
  agent.emit('agent:done', done(question.turnId, conversationId, true));

  const thread = owner.page.getByRole('log', { name: THREAD_RE });
  const continueButton = thread.getByRole('button', { name: CONTINUE_RE });
  await expect(continueButton).toHaveCount(1);
  await expect(thread.getByText(PARTIAL_RE)).toBeVisible();

  await continueButton.click();

  const continuation = sentContinueSchema.parse(await nthMessageSent(agent, 2));
  expect(continuation).toEqual({
    turnId: expect.any(String),
    conversationId,
    continuesTurnId: question.turnId,
    noteId: note.id,
  });
  expect(continuation.turnId).not.toBe(question.turnId);
  await expect(continueButton).toHaveCount(0);
  await expect(continueChips(thread)).toHaveCount(1);
  await expect(thread).toBeFocused();

  agent.emit('agent:chunk', {
    turnId: continuation.turnId,
    text: SECOND_SEGMENT,
  });
  agent.emit('agent:done', done(continuation.turnId, conversationId, true));

  const secondAnswer = thread.getByText(SECOND_SEGMENT);
  await expect(secondAnswer).toBeVisible();
  await expect(continueButton).toHaveCount(1);
  const [chipTop, answerTop, buttonTop] = await topsOf(
    continueChips(thread),
    secondAnswer,
    continueButton
  );
  expect(chipTop).toBeLessThan(answerTop);
  expect(answerTop).toBeLessThan(buttonTop);

  await owner.page.reload();
  const composerAfterReload = await openCopilotDock(owner.page);
  const reloaded = owner.page.getByRole('log', { name: THREAD_RE });
  const reloadedAnswer = reloaded.getByText(SECOND_SEGMENT);
  await expect(reloadedAnswer).toBeVisible();
  await expect(continueChips(reloaded)).toHaveCount(1);
  const reloadedButton = reloaded.getByRole('button', { name: CONTINUE_RE });
  await expect(reloadedButton).toHaveCount(1);
  await expect(reloaded.getByText(PARTIAL_RE)).toBeVisible();
  const [reloadedAnswerTop, reloadedButtonTop] = await topsOf(
    reloadedAnswer,
    reloadedButton
  );
  expect(reloadedAnswerTop).toBeLessThan(reloadedButtonTop);

  await composerAfterReload.fill(FOLLOW_UP);
  await owner.page.keyboard.press('Enter');
  const followUp = sentTurnSchema.parse(await nthMessageSent(agent, 3));
  agent.emit('agent:chunk', {
    turnId: followUp.turnId,
    text: FOLLOW_UP_ANSWER,
  });
  agent.emit('agent:done', done(followUp.turnId, conversationId, false));

  await expect(reloaded.getByText(FOLLOW_UP_ANSWER)).toBeVisible();
  await expect(reloadedButton).toHaveCount(0);
  await expect(continueChips(reloaded)).toHaveCount(1);
});
