import postgres from 'postgres';

import { E2E } from '../../support/environment';
import { test as sharingTest } from './sharing.fixture';

interface SeedCard {
  front: string;
  back: string;
  difficulty: 'easy' | 'medium' | 'hard';
}

interface SeedQuestion {
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
}

interface StudyFixture {
  seedDeck(noteId: string, ownerId: string, cards: SeedCard[]): Promise<string>;
  seedQuiz(
    noteId: string,
    ownerId: string,
    questions: SeedQuestion[]
  ): Promise<string>;
}

export const test = sharingTest.extend<{ study: StudyFixture }>({
  // eslint-disable-next-line no-empty-pattern -- Playwright requires a destructured fixture dependency list.
  study: async ({}, use) => {
    const db = postgres(E2E.database, { max: 1 });
    const insert = async (
      type: 'flashcard_deck' | 'quiz',
      noteId: string,
      ownerId: string,
      title: string,
      content: object
    ): Promise<string> => {
      const [row] = await db<{ id: string }[]>`
        insert into artifacts (type, user_id, source_note_id, title, content)
        values (${type}, ${ownerId}, ${noteId}, ${title}, ${JSON.stringify(content)}::jsonb)
        returning id
      `;
      if (!row) {
        throw new Error('Study artifact insert returned no id');
      }
      return row.id;
    };

    try {
      await use({
        seedDeck: (noteId, ownerId, cards) =>
          insert('flashcard_deck', noteId, ownerId, 'Fotosíntesis', { cards }),
        seedQuiz: (noteId, ownerId, questions) =>
          insert('quiz', noteId, ownerId, 'Quiz de fotosíntesis', {
            questions,
          }),
      });
    } finally {
      await db.end({ timeout: 5 });
    }
  },
});
