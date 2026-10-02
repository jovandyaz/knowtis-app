import { randomUUID } from 'node:crypto';

import postgres from 'postgres';

import type { MessageKind, MessageStopReason } from '@knowtis/shared-types';

import { E2E } from '../../support/environment';
import { test as copilotTest } from './copilot.fixture';

export interface SeededMessage {
  role: 'user' | 'assistant';
  content: string;
  stopReason?: MessageStopReason;
  kind?: MessageKind;
}

interface ConversationSeed {
  userId: string;
  noteId: string;
  title: string;
  messages: readonly SeededMessage[];
}

interface ConversationsFixture {
  // There is no create endpoint, so this writes the rows a real turn would leave.
  seed(seed: ConversationSeed): Promise<string>;
}

export const test = copilotTest.extend<{ conversations: ConversationsFixture }>(
  {
    // eslint-disable-next-line no-empty-pattern -- Playwright requires a destructured fixture dependency list.
    conversations: async ({}, use) => {
      const db = postgres(E2E.database, { max: 1 });
      const seeded: string[] = [];
      try {
        await use({
          async seed({ userId, noteId, title, messages }) {
            const [conversation] = await db<{ id: string }[]>`
              insert into conversations (user_id, note_id, title)
              values (${userId}, ${noteId}, ${title})
              returning id
            `;
            if (!conversation) {
              throw new Error('Conversation insert returned no id');
            }
            seeded.push(conversation.id);
            let turnId = randomUUID();
            for (const message of messages) {
              if (message.role === 'user') {
                turnId = randomUUID();
              }
              await db`
                insert into conversation_messages (conversation_id, turn_id, role, content, stop_reason, kind)
                values (${conversation.id}, ${turnId}, ${message.role}::conversation_role, ${message.content}, ${message.stopReason ?? null}, ${message.kind ?? null})
              `;
            }
            return conversation.id;
          },
        });
      } finally {
        try {
          if (seeded.length > 0) {
            await db`delete from conversations where id in ${db(seeded)}`;
          }
        } finally {
          await db.end({ timeout: 5 });
        }
      }
    },
  }
);
