import { Injectable } from '@nestjs/common';
import { tool, type ToolSet } from 'ai';
import { z } from 'zod';

import type { ProposedMutation } from '../../domain/proposed-mutation';
import { MutationProposalBuilder } from '../orchestrator/mutation-proposal.builder';
import type { ProposalCollector } from '../orchestrator/proposal-collector';
import type {
  AgentToolContext,
  AgentToolGroup,
  AgentToolPhase,
} from './agent-tool';

function captureProposal(
  collector: ProposalCollector,
  proposal: ProposedMutation
): { ok: true; proposalId: string; summary: string } {
  collector.capture(proposal);
  return { ok: true, proposalId: proposal.id, summary: proposal.summary };
}

@Injectable()
export class NoteMutateToolGroup implements AgentToolGroup {
  readonly name = 'note-mutate';

  constructor(private readonly proposalBuilder: MutationProposalBuilder) {}

  availableIn(phase: AgentToolPhase): boolean {
    return phase === 'full';
  }

  build(ctx: AgentToolContext): ToolSet {
    const { userId, proposals } = ctx;
    return {
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
            ? captureProposal(proposals, r.value)
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
            ? captureProposal(proposals, r.value)
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
            .min(3)
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
            ? captureProposal(proposals, r.value)
            : { error: r.error.message };
        },
      }),
    };
  }
}
