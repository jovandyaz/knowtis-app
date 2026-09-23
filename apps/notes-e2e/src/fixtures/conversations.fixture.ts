import { randomUUID } from 'node:crypto';

import postgres from 'postgres';

import { E2E } from '../../support/environment';
import { test as copilotTest } from './copilot.fixture';

export interface SeededMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface ConversationSeed {
  userId: string;
  noteId: string;
  title: string;
  messages: readonly SeededMessage[];
}

interface ConversationsFixture {
  /** Writes the rows a real turn would leave; there is no create endpoint. */
  seed(seed: ConversationSeed): Promise<string>;
}

export const test = copilotTest.extend<{ conversations: ConversationsFixture }>(
  {
    // eslint-disable-next-line no-empty-pattern -- Playwright requires a destructured fixture dependency list.
    conversations: async ({}, use) => {
      const db = postgres(E2E.database, { max: 1 });
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
            let turnId = randomUUID();
            for (const message of messages) {
              if (message.role === 'user') {
                turnId = randomUUID();
              }
              await db`
                insert into conversation_messages (conversation_id, turn_id, role, content)
                values (${conversation.id}, ${turnId}, ${message.role}::conversation_role, ${message.content})
              `;
            }
            return conversation.id;
          },
        });
      } finally {
        await db.end({ timeout: 5 });
      }
    },
  }
);
