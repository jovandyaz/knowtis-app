import { randomUUID } from 'node:crypto';

import { UserId } from '@jovandyaz/auth/server';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { err, ok, type Result } from 'neverthrow';

import {
  computeTokenCostUsd,
  detectPromptInjection,
  MODEL_CATALOG,
  sanitizeContent,
  type ModelCatalog,
} from '@knowtis/ai-gateway';
import {
  AI_ACTION,
  isClassifiable,
  MAX_RELATED_NOTES,
  MAX_SUGGESTED_TAGS,
  type OrganizationSuggestion,
  type RelatedNote,
  type SuggestedTag,
} from '@knowtis/shared-types';

import type { EnvConfig } from '../../../../config/env.config';
import {
  RETRIEVAL_PORT,
  type RetrievalPort,
} from '../../../agent/domain/ports/retrieval.port';
import { htmlToPlainText } from '../../../agent/infrastructure/sanitize/html-sanitizer';
import { AIOrchestrator } from '../../../ai/application/services/ai-orchestrator.service';
import { AIRateLimitService } from '../../../ai/application/services/ai-rate-limit.service';
import {
  AIErrors,
  type AIDomainError,
} from '../../../ai/domain/errors/ai.errors';
import { AI_STRUCTURED_OUTPUT_PROVIDER } from '../../../ai/domain/ports/ai-structured-output.port';
import type { AIStructuredOutputProvider } from '../../../ai/domain/ports/ai-structured-output.port';
import { TokenUsage } from '../../../ai/domain/value-objects/token-usage.vo';
import {
  NOTE_REPOSITORY,
  TAG_REPOSITORY,
  TagPath,
  type NoteContentSummary,
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
 * Both retrieval legs return nothing for a long query: the keyword fallback is
 * a substring ILIKE, and the lexical leg ANDs every term of a
 * websearch_to_tsquery. Related notes are looked up by the title, not the body.
 */
const RELATED_QUERY_MAX_CHARS = 120;
/** One fast call per note; wide enough for a bulk pass, narrow enough not to burst the provider. */
const SUGGEST_CONCURRENCY = 4;
const ESTIMATED_TOKENS_PER_NOTE = 2_300;
const SUGGEST_TIMEOUT_MS = 30_000;
/**
 * The answer is ~60 tokens; the rest is headroom for a reasoning model that
 * cannot be told to skip thinking. Reasoning counts against this budget, so a
 * ceiling near the answer size returns nothing at all instead of a suggestion.
 */
const SUGGEST_MAX_OUTPUT_TOKENS = 1_024;
/**
 * Classification, not composition. At the provider default a note sitting on the
 * prompt's "too thin to place" line lands in a different bucket run to run.
 */
const SUGGEST_TEMPERATURE = 0;
/**
 * The bucket is persisted as the user's data: a cross-family fallback swaps
 * the classifier mid-flight, so the same note lands in a different bucket
 * depending on which provider was healthy. Degrading to no suggestion is
 * cheaper than an inconsistent one.
 */
const SUGGEST_FALLBACK_SCOPE = 'same-family' as const;

const NOTE_FAILURE = {
  RATE_LIMIT: 'rate-limit',
  PROVIDER: 'provider',
} as const;
type NoteFailure = (typeof NOTE_FAILURE)[keyof typeof NOTE_FAILURE];

interface NoteOutcome {
  readonly suggestion: OrganizationSuggestion;
  readonly failure?: NoteFailure;
}

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
    private readonly structuredOutputProvider: AIStructuredOutputProvider,
    @Inject(MODEL_CATALOG) private readonly modelCatalog: ModelCatalog
  ) {}

  async execute(
    input: SuggestOrganizationInput
  ): Promise<Result<OrganizationSuggestion[], AIDomainError>> {
    const requestId = randomUUID();
    const userIdResult = UserId.create(input.userId);
    if (userIdResult.isErr()) {
      return err(AIErrors.invalidInput('Invalid user id'));
    }

    const noteIds = [...new Set(input.noteIds)];

    // Ownership is checked for every id before any provider call: suggestions
    // set a classification only the owner may write. A missing note and a
    // foreign one must fail identically so the endpoint is not an existence oracle.
    const owned = (
      await this.noteRepository.findOwnedSummariesByIds(
        noteIds,
        userIdResult.value
      )
    ).filter((note) => note.ownerId === input.userId);
    if (owned.length !== noteIds.length) {
      return err(
        AIErrors.forbidden('Suggestions are only available on your own notes')
      );
    }

    const modelResult = await this.orchestrator.selectModel(
      AI_ACTION.SUGGEST_ORGANIZATION
    );
    if (modelResult.isErr()) {
      return err(modelResult.error);
    }
    const model = modelResult.value.toPrimitive();
    const instructions = this.orchestrator.getSystemPrompt(
      AI_ACTION.SUGGEST_ORGANIZATION
    );

    const pricing = this.modelCatalog.getPricing(model);
    const estimatedCostUsd = pricing
      ? computeTokenCostUsd(
          { inputTokens: ESTIMATED_TOKENS_PER_NOTE, outputTokens: 0 },
          pricing
        )
      : 0;

    const { vocabulary, known } = await this.loadVocabulary(userIdResult.value);

    const outcomes: NoteOutcome[] = [];
    for (let i = 0; i < owned.length; i += SUGGEST_CONCURRENCY) {
      const batch = owned.slice(i, i + SUGGEST_CONCURRENCY);
      const batchOutcomes = await Promise.all(
        batch.map((note) =>
          this.suggestOne({
            note,
            userId: input.userId,
            model,
            instructions,
            estimatedCostUsd,
            vocabulary,
            known,
            requestId,
            ...(input.clientIp !== undefined
              ? { clientIp: input.clientIp }
              : {}),
          })
        )
      );
      outcomes.push(...batchOutcomes);
    }

    const failures = outcomes.filter(
      (outcome) => outcome.failure !== undefined
    );
    if (owned.length > 0 && failures.length === owned.length) {
      this.logger.error({
        event: 'ai.suggest-organization.all-failed',
        requestId,
        userId: input.userId,
        noteCount: owned.length,
      });
      return err(
        failures[0]?.failure === NOTE_FAILURE.RATE_LIMIT
          ? AIErrors.rateLimitExceeded()
          : AIErrors.providerError(
              'The AI provider could not classify these notes. Please try again.'
            )
      );
    }

    this.logger.log({
      event: 'ai.suggest-organization.complete',
      requestId,
      userId: input.userId,
      noteCount: outcomes.length,
      failedCount: failures.length,
    });

    return ok(outcomes.map((outcome) => outcome.suggestion));
  }

  /**
   * `known` covers the author's whole tree while the prompt only carries the
   * most-used slice: marking a rank-80 tag "new" would offer to create a tag
   * that already exists.
   */
  private async loadVocabulary(
    userId: UserId
  ): Promise<{ vocabulary: string[]; known: Set<string> }> {
    const tree = await this.readTagTree(userId);
    const vocabulary = [...tree]
      .sort((a, b) => b.noteCount - a.noteCount)
      .slice(0, MAX_VOCABULARY_TAGS)
      .map((tag) => tag.path);
    return { vocabulary, known: new Set(tree.map((tag) => tag.path)) };
  }

  /**
   * The vocabulary is optional context, so a lookup failure must not escape the
   * `Result` contract as an unmapped 500. Without it every tag reads as new.
   */
  private async readTagTree(
    userId: UserId
  ): Promise<{ path: string; noteCount: number }[]> {
    try {
      return await this.tagRepository.findTreeByOwner(userId);
    } catch (error) {
      this.logger.warn({
        event: 'ai.suggest-organization.vocabulary-failed',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return [];
    }
  }

  /**
   * A model failure degrades that one note to an empty suggestion rather than
   * failing the whole bulk pass — the user still gets the rows that worked.
   */
  private async suggestOne(params: {
    note: NoteContentSummary;
    userId: string;
    model: string;
    instructions: string;
    estimatedCostUsd: number;
    vocabulary: string[];
    known: Set<string>;
    requestId: string;
    clientIp?: string;
  }): Promise<NoteOutcome> {
    const { note, userId, model, instructions, estimatedCostUsd, requestId } =
      params;
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
    const content = sanitizeContent(htmlToPlainText(note.content)).slice(
      0,
      MAX_CONTENT_CHARS
    );

    // The client applies the same floor for instant feedback, but only this
    // check binds: MCP callers, bulk passes, and a body the editor has not
    // persisted yet all reach here without it.
    if (!isClassifiable(content)) {
      return { suggestion: empty };
    }

    const injection = detectPromptInjection(`${title}\n${content}`);
    if (!injection.safe) {
      this.logger.warn({
        event: 'ai.suggest-organization.injection_blocked',
        requestId,
        noteId: note.id,
        score: injection.score,
        reason: injection.reason,
      });
      return { suggestion: empty };
    }

    const rateLimitCheck = await this.rateLimitService.checkLimit(
      userId,
      ESTIMATED_TOKENS_PER_NOTE,
      false,
      false,
      estimatedCostUsd,
      params.clientIp
    );
    if (!rateLimitCheck.allowed) {
      this.logger.warn({
        event: 'ai.suggest-organization.rejected',
        requestId,
        noteId: note.id,
        reason: rateLimitCheck.reason,
      });
      return { suggestion: empty, failure: NOTE_FAILURE.RATE_LIMIT };
    }

    try {
      const result =
        await this.structuredOutputProvider.generateStructuredOutput(
          this.buildUserPrompt({ title, content }, params.vocabulary),
          suggestOrganizationSchema,
          {
            model,
            instructions,
            maxOutputTokens: SUGGEST_MAX_OUTPUT_TOKENS,
            temperature: SUGGEST_TEMPERATURE,
            fallbackScope: SUGGEST_FALLBACK_SCOPE,
            timeoutMs: SUGGEST_TIMEOUT_MS,
            maxRetries: this.configService.get('AI_MAX_RETRIES'),
          }
        );

      this.recordUsage({
        userId,
        estimatedCostUsd,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        model: result.model,
        requestId,
      });

      return {
        suggestion: {
          noteId: note.id,
          bucket: result.object.bucket,
          tags: this.toSuggestedTags(result.object.tags, params.known),
          relatedNotes: await this.findRelated(userId, {
            id: note.id,
            title,
            content,
          }),
        },
      };
    } catch (error) {
      this.logger.warn({
        event: 'ai.suggest-organization.note-failed',
        requestId,
        noteId: note.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      void this.rateLimitService.releaseReservation(
        userId,
        ESTIMATED_TOKENS_PER_NOTE,
        estimatedCostUsd
      );
      return { suggestion: empty, failure: NOTE_FAILURE.PROVIDER };
    }
  }

  private recordUsage(params: {
    userId: string;
    estimatedCostUsd: number;
    inputTokens: number;
    outputTokens: number;
    model: string;
    requestId: string;
  }): void {
    const usage = TokenUsage.create(
      {
        inputTokens: params.inputTokens,
        outputTokens: params.outputTokens,
        model: params.model,
      },
      this.modelCatalog.getPricing(params.model)
    );

    this.rateLimitService
      .recordUsage({
        userId: params.userId,
        action: AI_ACTION.SUGGEST_ORGANIZATION,
        model: params.model,
        estimatedTokens: ESTIMATED_TOKENS_PER_NOTE,
        estimatedCostUsd: params.estimatedCostUsd,
        inputTokens: params.inputTokens,
        outputTokens: params.outputTokens,
        costUsd: usage.costUsd,
      })
      .catch((error: unknown) =>
        this.logger.warn({
          event: 'ai.usage.record_failed',
          requestId: params.requestId,
          userId: params.userId,
          error: error instanceof Error ? error.message : 'Unknown error',
        })
      );
  }

  /**
   * The model is never asked whether a tag is new; the server decides from the
   * vocabulary. Paths that `PATCH /notes/:id` would reject are dropped here —
   * it validates the whole array, so one bad path would discard the good ones.
   */
  private toSuggestedTags(paths: string[], known: Set<string>): SuggestedTag[] {
    const seen = new Set<string>();
    const tags: SuggestedTag[] = [];
    for (const raw of paths) {
      const parsed = TagPath.create(raw);
      if (parsed.isErr()) {
        continue;
      }
      const path = parsed.value.value;
      if (seen.has(path)) {
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
  ): Promise<RelatedNote[]> {
    const query = (note.title.trim() || note.content.trim()).slice(
      0,
      RELATED_QUERY_MAX_CHARS
    );
    if (!query) {
      return [];
    }

    try {
      const hits = await this.retrieval.search(userId, query);
      return hits
        .filter((hit) => hit.id !== note.id)
        .slice(0, MAX_RELATED_NOTES)
        .map((hit) => ({ id: hit.id, title: hit.title }));
    } catch (error) {
      this.logger.warn({
        event: 'ai.suggest-organization.related-failed',
        noteId: note.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
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
