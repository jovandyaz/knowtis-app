import { randomUUID } from 'node:crypto';

import { UserId } from '@jovandyaz/auth/server';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { err, ok, type Result } from 'neverthrow';

import { detectPromptInjection, sanitizeContent } from '@knowtis/ai-gateway';
import {
  AI_ACTION,
  MAX_RELATED_NOTES,
  MAX_SUGGESTED_TAGS,
  type OrganizationSuggestion,
  type ParaBucket,
  type SuggestedTag,
} from '@knowtis/shared-types';

import type { EnvConfig } from '../../../../config/env.config';
import {
  RETRIEVAL_PORT,
  type RetrievalPort,
} from '../../../agent/domain/ports/retrieval.port';
import { AIOrchestrator } from '../../../ai/application/services/ai-orchestrator.service';
import { AIRateLimitService } from '../../../ai/application/services/ai-rate-limit.service';
import {
  AIErrors,
  type AIDomainError,
} from '../../../ai/domain/errors/ai.errors';
import { AI_STRUCTURED_OUTPUT_PROVIDER } from '../../../ai/domain/ports/ai-structured-output.port';
import type { AIStructuredOutputProvider } from '../../../ai/domain/ports/ai-structured-output.port';
import {
  NOTE_REPOSITORY,
  TAG_REPOSITORY,
  type NoteRepository,
  type TagRepository,
} from '../../../notes/domain';
import { suggestOrganizationSchema } from '../../domain/schemas/suggest-organization.schema';

export interface SuggestOrganizationInput {
  readonly userId: string;
  readonly noteIds: string[];
  readonly clientIp?: string;
}

/** Vocabulary sent to the model, most-used first so the useful part survives the cap. */
const MAX_VOCABULARY_TAGS = 60;
const MAX_CONTENT_CHARS = 5_000;
/**
 * Related-note lookups run through the retrieval port, whose keyword fallback
 * matches titles. Handing it the whole body guarantees zero hits, so the query
 * stays a short topical lead.
 */
const RELATED_QUERY_MAX_CHARS = 280;
/** One fast call per note; wide enough for a bulk pass, narrow enough not to burst the provider. */
const SUGGEST_CONCURRENCY = 4;
const ESTIMATED_TOKENS_PER_NOTE = 1_500;

@Injectable()
export class SuggestOrganizationHandler {
  private readonly logger = new Logger(SuggestOrganizationHandler.name);

  constructor(
    private readonly orchestrator: AIOrchestrator,
    private readonly rateLimitService: AIRateLimitService,
    private readonly configService: ConfigService<EnvConfig, true>,
    @Inject(NOTE_REPOSITORY) private readonly noteRepository: NoteRepository,
    @Inject(TAG_REPOSITORY) private readonly tagRepository: TagRepository,
    @Inject(RETRIEVAL_PORT) private readonly retrieval: RetrievalPort,
    @Inject(AI_STRUCTURED_OUTPUT_PROVIDER)
    private readonly structuredOutputProvider: AIStructuredOutputProvider
  ) {}

  async execute(
    input: SuggestOrganizationInput
  ): Promise<Result<OrganizationSuggestion[], AIDomainError>> {
    const requestId = randomUUID();
    const userIdResult = UserId.create(input.userId);
    if (userIdResult.isErr()) {
      return err(AIErrors.invalidInput('Invalid user id'));
    }

    // Ownership is checked for every id before any provider call: suggestions
    // set a classification only the owner may write.
    const notes = await Promise.all(
      input.noteIds.map((id) => this.noteRepository.findById(id))
    );
    const owned = notes.filter(
      (note) => note !== null && note.ownerId === input.userId
    );
    if (owned.length !== input.noteIds.length) {
      return err(
        AIErrors.forbidden('Suggestions are only available on your own notes')
      );
    }

    const rateLimitCheck = await this.rateLimitService.checkLimit(
      input.userId,
      ESTIMATED_TOKENS_PER_NOTE * owned.length,
      false,
      false,
      0,
      input.clientIp
    );
    if (!rateLimitCheck.allowed) {
      this.logger.warn({
        event: 'ai.suggest-organization.rejected',
        requestId,
        userId: input.userId,
        reason: rateLimitCheck.reason,
      });
      return err(AIErrors.rateLimitExceeded());
    }

    const modelResult = await this.orchestrator.selectModel(
      AI_ACTION.SUGGEST_ORGANIZATION
    );
    if (modelResult.isErr()) {
      return err(modelResult.error);
    }
    const model = modelResult.value.toPrimitive();
    const system = this.orchestrator.getSystemPrompt(
      AI_ACTION.SUGGEST_ORGANIZATION
    );

    const vocabulary = await this.loadVocabulary(userIdResult.value);
    const known = new Set(vocabulary);

    const suggestions: OrganizationSuggestion[] = [];
    for (let i = 0; i < owned.length; i += SUGGEST_CONCURRENCY) {
      const batch = owned.slice(i, i + SUGGEST_CONCURRENCY);
      const settled = await Promise.all(
        batch.map((note) =>
          this.suggestOne({
            note: note as NonNullable<(typeof owned)[number]>,
            userId: input.userId,
            model,
            system,
            vocabulary,
            known,
            requestId,
          })
        )
      );
      suggestions.push(...settled);
    }

    this.logger.log({
      event: 'ai.suggest-organization.complete',
      requestId,
      userId: input.userId,
      noteCount: suggestions.length,
    });

    return ok(suggestions);
  }

  private async loadVocabulary(userId: UserId): Promise<string[]> {
    const tree = await this.tagRepository.findTreeByOwner(userId);
    return [...tree]
      .sort((a, b) => b.noteCount - a.noteCount)
      .slice(0, MAX_VOCABULARY_TAGS)
      .map((tag) => tag.path);
  }

  /**
   * A model failure degrades that one note to an empty suggestion rather than
   * failing the whole bulk pass — the user still gets the rows that worked.
   */
  private async suggestOne(params: {
    note: { id: string; title: string; content: string };
    userId: string;
    model: string;
    system: string;
    vocabulary: string[];
    known: Set<string>;
    requestId: string;
  }): Promise<OrganizationSuggestion> {
    const { note, model, system, vocabulary, known, requestId } = params;
    const empty: OrganizationSuggestion = {
      noteId: note.id,
      bucket: null,
      tags: [],
      relatedNotes: [],
    };

    // Note bodies are untrusted: text pasted from elsewhere can carry
    // instructions aimed at the classifier. A flagged note degrades to an
    // empty suggestion rather than failing the whole pass.
    const title = sanitizeContent(note.title);
    const content = sanitizeContent(note.content).slice(0, MAX_CONTENT_CHARS);
    const injection = detectPromptInjection(`${title}\n${content}`);
    if (!injection.safe) {
      this.logger.warn({
        event: 'ai.suggest-organization.injection_blocked',
        requestId,
        noteId: note.id,
        score: injection.score,
        reason: injection.reason,
      });
      return empty;
    }

    try {
      const result =
        await this.structuredOutputProvider.generateStructuredOutput(
          this.buildUserPrompt({ title, content }, vocabulary),
          suggestOrganizationSchema,
          {
            model,
            system,
            maxRetries: this.configService.get('AI_MAX_RETRIES'),
          }
        );

      return {
        noteId: note.id,
        bucket: result.object.bucket as ParaBucket | null,
        tags: this.markNewTags(result.object.tags, known),
        relatedNotes: await this.findRelated(params.userId, {
          id: note.id,
          title,
          content,
        }),
      };
    } catch (error) {
      this.logger.warn({
        event: 'ai.suggest-organization.note-failed',
        requestId,
        noteId: note.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return empty;
    }
  }

  /** The model is never asked whether a tag is new; the server decides from the vocabulary. */
  private markNewTags(paths: string[], known: Set<string>): SuggestedTag[] {
    const seen = new Set<string>();
    const tags: SuggestedTag[] = [];
    for (const raw of paths) {
      const path = raw.trim().toLowerCase();
      if (!path || seen.has(path)) {
        continue;
      }
      seen.add(path);
      tags.push({ path, isNew: !known.has(path) });
    }
    return tags.slice(0, MAX_SUGGESTED_TAGS);
  }

  /**
   * Related notes come from the embedding index, so the model is never asked
   * for a note id and a hallucinated one is structurally impossible.
   */
  private async findRelated(
    userId: string,
    note: { id: string; title: string; content: string }
  ): Promise<{ id: string; title: string }[]> {
    try {
      const hits = await this.retrieval.search(
        userId,
        `${note.title}\n${note.content}`.slice(0, RELATED_QUERY_MAX_CHARS)
      );
      return hits
        .filter((hit) => hit.id !== note.id)
        .slice(0, MAX_RELATED_NOTES)
        .map((hit) => ({ id: hit.id, title: hit.title }));
    } catch {
      return [];
    }
  }

  private buildUserPrompt(
    note: { title: string; content: string },
    vocabulary: string[]
  ): string {
    const known = vocabulary.length
      ? vocabulary.join('\n')
      : '(the author has no tags yet)';

    return [
      `Return at most ${MAX_SUGGESTED_TAGS} tags.`,
      '',
      '<existing-tags>',
      known,
      '</existing-tags>',
      '',
      '<note>',
      `Title: ${note.title}`,
      note.content,
      '</note>',
    ].join('\n');
  }
}
