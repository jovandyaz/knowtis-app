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

const MAX_EDITS_PER_PROPOSAL = 20;
const MAX_EDIT_TEXT_CHARS = 10_000;
const CONTENT_MARKDOWN_DESCRIPTION =
  'The note body in Markdown: headings (levels 1–3), bold/italic/strikethrough, links, inline and fenced code, bullet and numbered lists, task lists (- [ ] / - [x], nesting allowed), blockquotes, horizontal rules, GFM tables, ==highlight==, ^superscript^, ~subscript~, ```mermaid fenced diagrams, and images as ![alt](url "caption") ONLY with a url that getNote returned — any other image is dropped. Raw HTML is not supported.';

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
            .describe(CONTENT_MARKDOWN_DESCRIPTION),
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
      proposeEditNote: tool({
        description:
          "Propose changing PART of an existing note. Does NOT edit it — the user must confirm. Prefer this over proposeUpdateNote whenever the user asks to add, fix, remove or reword something: you send only the text that changes, so the rest of the note cannot be lost. Each edit replaces oldText — copied EXACTLY from getNote's content, Markdown punctuation included, and long enough to appear only once — with newText. Edits apply in order. To add to the end of the note use appendMarkdown instead of an edit. noteId must come from searchNotes/getNote.",
        inputSchema: z.object({
          noteId: z.string().uuid().describe('The note id to edit'),
          edits: z
            .array(
              z.object({
                oldText: z
                  .string()
                  .min(1)
                  .max(MAX_EDIT_TEXT_CHARS)
                  .describe(
                    'Exact text currently in the note, as getNote returned it'
                  ),
                newText: z
                  .string()
                  .max(MAX_EDIT_TEXT_CHARS)
                  .describe(
                    'Replacement Markdown, same vocabulary as contentMarkdown (no raw HTML; an image only with a url getNote returned); empty to delete oldText'
                  ),
              })
            )
            .max(MAX_EDITS_PER_PROPOSAL)
            .default([]),
          appendMarkdown: z
            .string()
            .max(MAX_EDIT_TEXT_CHARS)
            .optional()
            .describe('Markdown to add after the end of the note'),
        }),
        execute: async ({ noteId, edits, appendMarkdown }) => {
          const r = await this.proposalBuilder.buildEdit(userId, noteId, {
            edits,
            ...(appendMarkdown !== undefined && { appendMarkdown }),
          });
          return r.isOk()
            ? captureProposal(proposals, r.value)
            : { error: r.error.message };
        },
      }),
      proposeUpdateNote: tool({
        description:
          "Propose replacing an existing note's title and/or its WHOLE content. Does NOT edit it — the user must confirm. Use it for a title change, or when the user asks to rewrite or restructure the entire note; to change part of a note use proposeEditNote. Refused when you did not receive the whole note. noteId must come from searchNotes/getNote.",
        inputSchema: z
          .object({
            noteId: z.string().uuid().describe('The note id to edit'),
            title: z.string().min(1).max(200).optional(),
            contentMarkdown: z
              .string()
              .max(20000)
              .describe(CONTENT_MARKDOWN_DESCRIPTION)
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
          'Propose sharing a note with another user by email. Does NOT share it — the user must confirm. noteId must come from searchNotes/getNote. Adding a person or upgrading viewer to editor requires a verified email when confirmed; reducing or retaining access does not. If confirmation requires verification, relay that instruction instead of retrying.',
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
