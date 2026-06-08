import { Inject, Injectable } from '@nestjs/common';
import { tool } from 'ai';
import { z } from 'zod';

import {
  RETRIEVAL_PORT,
  type RetrievalPort,
} from '../../domain/ports/retrieval.port';

@Injectable()
export class AgentToolsFactory {
  constructor(
    @Inject(RETRIEVAL_PORT) private readonly retrieval: RetrievalPort
  ) {}

  build(userId: string) {
    return {
      searchNotes: tool({
        description:
          "Search the user's notes by keyword. Returns matching notes as {id, title}. Use this to find notes before answering questions about them.",
        inputSchema: z.object({
          query: z
            .string()
            .min(1)
            .describe('Keywords to search note titles/content'),
        }),
        execute: async ({ query }) => this.retrieval.search(userId, query),
      }),
      getNote: tool({
        description:
          'Fetch the full content of one note by its id. Only ids returned by searchNotes are valid. Returns {id, title, content} or a not-found marker.',
        inputSchema: z.object({
          noteId: z.string().uuid().describe('The note id from searchNotes'),
        }),
        execute: async ({ noteId }) => {
          const note = await this.retrieval.getById(userId, noteId);
          return note ?? { error: 'Note not found or not accessible.' };
        },
      }),
    };
  }
}
