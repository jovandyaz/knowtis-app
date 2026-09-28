import { Injectable } from '@nestjs/common';
import { tool, type ToolSet } from 'ai';
import { z } from 'zod';

import { AgentErrors } from '../../domain/agent-errors';
import type { ProposedMutation } from '../../domain/proposed-mutation';
import { MutationProposalBuilder } from '../orchestrator/mutation-proposal.builder';
import type { ProposalCollector } from '../orchestrator/proposal-collector';
import type {
  AgentToolContext,
  AgentToolGroup,
  AgentToolPhase,
} from './agent-tool';
import {
  classifyNoteStoreFailure,
  wrapUpstreamFailure,
} from './tool-execution.error';

const MAX_EDITS_PER_PROPOSAL = 20;
const MAX_MARKDOWN_CHARS = 20_000;
const MERMAID_ESCAPE_GUIDANCE =
  'Inside a ```mermaid diagram never write a semicolon or a # in a label or message: mermaid reads them as the end of the statement or a comment and the diagram fails to render, so write #59; for a semicolon and #35; for a # instead.';
const CONTENT_MARKDOWN_DESCRIPTION = `The note body in Markdown: headings (levels 1–3), bold/italic/strikethrough, ++underline++, links, inline and fenced code, bullet and numbered lists, task lists (- [ ] / - [x], nesting allowed), blockquotes, horizontal rules, GFM tables, ==highlight==, ^superscript^, ~subscript~, \`\`\`mermaid fenced diagrams, and images as ![alt](url "caption") ONLY with a url that getNote returned — any other image is dropped. Raw HTML is not supported. ${MERMAID_ESCAPE_GUIDANCE}`;

// a provider that decodes against the schema stops a string at maxLength
// instead of failing it, so text that fills the limit exactly was cut off
function refuseMarkdownAtLimit(
  field: string,
  text: string | undefined
): { error: string } | undefined {
  return text?.length === MAX_MARKDOWN_CHARS
    ? { error: AgentErrors.markdownAtLimit(field, MAX_MARKDOWN_CHARS).message }
    : undefined;
}

function refuseEditAtLimit(
  edits: readonly { oldText: string; newText: string }[]
): { error: string } | undefined {
  for (const [i, edit] of edits.entries()) {
    const cut = (['oldText', 'newText'] as const).find(
      (field) => edit[field].length === MAX_MARKDOWN_CHARS
    );
    if (cut) {
      return {
        error: AgentErrors.editFieldAtLimit(i + 1, cut, MAX_MARKDOWN_CHARS)
          .message,
      };
    }
  }
  return undefined;
}

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
    const { userId, execution, proposals } = ctx;
    return {
      proposeCreateNote: tool({
        description:
          'Propose creating a new note. Does NOT create it — the user must confirm. Use when the user asks to create/draft a note.',
        inputSchema: z.object({
          title: z.string().min(1).max(200).describe('The note title'),
          contentMarkdown: z
            .string()
            .max(MAX_MARKDOWN_CHARS)
            .describe(CONTENT_MARKDOWN_DESCRIPTION),
        }),
        execute: async ({ title, contentMarkdown }) => {
          const refused = refuseMarkdownAtLimit(
            'contentMarkdown',
            contentMarkdown
          );
          if (refused) {
            return refused;
          }
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
                  .max(MAX_MARKDOWN_CHARS)
                  .describe(
                    'Exact text currently in the note, as getNote returned it'
                  ),
                newText: z
                  .string()
                  .max(MAX_MARKDOWN_CHARS)
                  .describe(
                    `Replacement Markdown, same vocabulary as contentMarkdown (no raw HTML; an image only with a url getNote returned); empty to delete oldText. ${MERMAID_ESCAPE_GUIDANCE}`
                  ),
              })
            )
            .max(MAX_EDITS_PER_PROPOSAL)
            .default([]),
          appendMarkdown: z
            .string()
            .max(MAX_MARKDOWN_CHARS)
            .optional()
            .describe(
              `Markdown to add after the end of the note, same vocabulary as contentMarkdown. ${MERMAID_ESCAPE_GUIDANCE}`
            ),
        }),
        execute: async ({ noteId, edits, appendMarkdown }) => {
          const refused =
            refuseEditAtLimit(edits) ??
            refuseMarkdownAtLimit('appendMarkdown', appendMarkdown);
          if (refused) {
            return refused;
          }
          const r = await wrapUpstreamFailure(
            () =>
              this.proposalBuilder.buildEdit(userId, noteId, {
                edits,
                ...(appendMarkdown !== undefined && { appendMarkdown }),
              }),
            classifyNoteStoreFailure
          );
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
              .max(MAX_MARKDOWN_CHARS)
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
          const refused = refuseMarkdownAtLimit(
            'contentMarkdown',
            contentMarkdown
          );
          if (refused) {
            return refused;
          }
          const r = await wrapUpstreamFailure(
            () =>
              this.proposalBuilder.buildUpdate(execution, noteId, {
                ...(title !== undefined && { title }),
                ...(contentMarkdown !== undefined && { contentMarkdown }),
              }),
            classifyNoteStoreFailure
          );
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
          const r = await wrapUpstreamFailure(
            () =>
              this.proposalBuilder.buildShare(
                userId,
                noteId,
                targetEmail,
                permission
              ),
            classifyNoteStoreFailure
          );
          return r.isOk()
            ? captureProposal(proposals, r.value)
            : { error: r.error.message };
        },
      }),
    };
  }
}
