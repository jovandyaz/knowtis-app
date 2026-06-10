import { Inject, Injectable } from '@nestjs/common';
import { tool } from 'ai';
import { z } from 'zod';

import {
  RETRIEVAL_PORT,
  type RetrievalPort,
} from '../../domain/ports/retrieval.port';
import type { ProposedMutation } from '../../domain/proposed-mutation';
import { MutationProposalBuilder } from './mutation-proposal.builder';
import type { ProposalCollector } from './proposal-collector';

@Injectable()
export class AgentToolsFactory {
  constructor(
    @Inject(RETRIEVAL_PORT) private readonly retrieval: RetrievalPort,
    private readonly proposalBuilder: MutationProposalBuilder
  ) {}

  buildReadOnly(userId: string) {
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
        execute: async ({ query }) => this.retrieval.search(userId, query),
      }),
      getNote: tool({
        description:
          'Fetch the full content of one note by its id. Only ids returned by searchNotes are valid. Returns {id, title, content, createdAt, updatedAt, isOwner, isSharedWithMe, isPubliclyShared} or a not-found marker.',
        inputSchema: z.object({
          noteId: z.string().uuid().describe('The note id from searchNotes'),
        }),
        execute: async ({ noteId }) => {
          const note = await this.retrieval.getById(userId, noteId);
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
        execute: async ({ limit }) => this.retrieval.listRecent(userId, limit),
      }),
      getNotesOverview: tool({
        description:
          "Get counts of the user's notes: total accessible, owned by the user, and shared-with-the-user. Use for 'how many notes do I have' style questions.",
        inputSchema: z.object({}),
        execute: async () => this.retrieval.overview(userId),
      }),
    };
  }

  build(userId: string, collector: ProposalCollector) {
    return {
      ...this.buildReadOnly(userId),
      proposeCreateNote: tool({
        description:
          'Propose creating a new note. Does NOT create it — the user must confirm. Use when the user asks to create/draft a note.',
        inputSchema: z.object({
          title: z.string().min(1).max(200).describe('The note title'),
          contentMarkdown: z
            .string()
            .max(20000)
            .describe(
              'The note body in basic Markdown (headings, lists, bold/italic, links, code, blockquotes). Tables, images and raw HTML are not supported.'
            ),
        }),
        execute: async ({ title, contentMarkdown }) => {
          const r = await this.proposalBuilder.buildCreate(
            userId,
            title,
            contentMarkdown
          );
          return r.isOk()
            ? this.captureProposal(collector, r.value)
            : { error: r.error.message };
        },
      }),
      proposeUpdateNote: tool({
        description:
          'Propose editing an existing note (title and/or content). Does NOT edit it — the user must confirm. noteId must come from searchNotes/getNote.',
        inputSchema: z
          .object({
            noteId: z.string().uuid().describe('The note id to edit'),
            title: z.string().min(1).max(200).optional(),
            contentMarkdown: z
              .string()
              .max(20000)
              .describe(
                'The note body in basic Markdown (headings, lists, bold/italic, links, code, blockquotes). Tables, images and raw HTML are not supported.'
              )
              .optional(),
          })
          .refine(
            (v) => v.title !== undefined || v.contentMarkdown !== undefined,
            {
              message: 'Provide a title or contentMarkdown to update',
            }
          ),
        execute: async ({ noteId, title, contentMarkdown }) => {
          const r = await this.proposalBuilder.buildUpdate(userId, noteId, {
            ...(title !== undefined && { title }),
            ...(contentMarkdown !== undefined && { contentMarkdown }),
          });
          return r.isOk()
            ? this.captureProposal(collector, r.value)
            : { error: r.error.message };
        },
      }),
      proposeShareNote: tool({
        description:
          'Propose sharing a note with another user by email. Does NOT share it — the user must confirm. noteId must come from searchNotes/getNote.',
        inputSchema: z.object({
          noteId: z.string().uuid(),
          targetEmail: z
            .string()
            .email()
            .describe('Email of the person to share with'),
          permission: z.enum(['viewer', 'editor']).default('viewer'),
        }),
        execute: async ({ noteId, targetEmail, permission }) => {
          const r = await this.proposalBuilder.buildShare(
            userId,
            noteId,
            targetEmail,
            permission
          );
          return r.isOk()
            ? this.captureProposal(collector, r.value)
            : { error: r.error.message };
        },
      }),
    };
  }

  private captureProposal(
    collector: ProposalCollector,
    proposal: ProposedMutation
  ): { ok: true; proposalId: string; summary: string } {
    collector.capture(proposal);
    return { ok: true, proposalId: proposal.id, summary: proposal.summary };
  }
}
