import { Inject, Injectable } from '@nestjs/common';
import { tool, type ToolSet } from 'ai';
import { z } from 'zod';

import {
  RETRIEVAL_PORT,
  type RetrievalPort,
} from '../../domain/ports/retrieval.port';
import type { AgentToolContext, AgentToolGroup } from './agent-tool';
import {
  TOOL_ERROR_CODES,
  ToolExecutionError,
  wrapUpstreamFailure,
} from './tool-execution.error';

function classifyNoteStoreFailure(error: unknown): ToolExecutionError {
  return new ToolExecutionError(
    TOOL_ERROR_CODES.NOTE_STORE_FAILED,
    'Note store request failed',
    { cause: error }
  );
}

@Injectable()
export class NoteReadToolGroup implements AgentToolGroup {
  readonly name = 'note-read';

  constructor(
    @Inject(RETRIEVAL_PORT) private readonly retrieval: RetrievalPort
  ) {}

  availableIn(): boolean {
    return true;
  }

  build(ctx: AgentToolContext): ToolSet {
    const { userId } = ctx;
    return {
      searchNotes: tool({
        description:
          "Search the user's notes by keyword. Returns matching notes as {id, title, updatedAt, isOwner, isSharedWithMe (owned by someone else and shared with you), isPubliclyShared (you exposed it via link/token)}. Use this to find notes before answering questions about them.",
        inputSchema: z.object({
          query: z
            .string()
            .min(1)
            .describe('Keywords to search note titles/content'),
        }),
        execute: async ({ query }) =>
          wrapUpstreamFailure(
            () => this.retrieval.search(userId, query),
            classifyNoteStoreFailure
          ),
      }),
      getNote: tool({
        description:
          'Fetch the full content of one note by its id. Only ids returned by searchNotes are valid. Returns {id, title, content, createdAt, updatedAt, isOwner, isSharedWithMe, isPubliclyShared} or a not-found marker.',
        inputSchema: z.object({
          noteId: z.string().uuid().describe('The note id from searchNotes'),
        }),
        execute: async ({ noteId }) => {
          const note = await wrapUpstreamFailure(
            () => this.retrieval.getById(userId, noteId),
            classifyNoteStoreFailure
          );
          return note ?? { error: 'Note not found or not accessible.' };
        },
      }),
      listRecentNotes: tool({
        description:
          "List the user's most recently updated notes (returns {id, title, updatedAt, isOwner, isSharedWithMe, isPubliclyShared}, newest first). Use for questions about recent/latest notes or what the user worked on recently.",
        inputSchema: z.object({
          limit: z
            .number()
            .int()
            .min(1)
            .max(20)
            .default(5)
            .describe('How many recent notes to return'),
        }),
        execute: async ({ limit }) =>
          wrapUpstreamFailure(
            () => this.retrieval.listRecent(userId, limit),
            classifyNoteStoreFailure
          ),
      }),
      getNotesOverview: tool({
        description:
          "Get counts of the user's notes: total accessible, owned by the user, and shared-with-the-user. Use for 'how many notes do I have' style questions.",
        inputSchema: z.object({}),
        execute: async () =>
          wrapUpstreamFailure(
            () => this.retrieval.overview(userId),
            classifyNoteStoreFailure
          ),
      }),
    };
  }
}
