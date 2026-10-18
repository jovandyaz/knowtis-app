import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { MODEL_CATALOG, type ModelCatalog } from '@knowtis/ai-gateway';

import type { EnvConfig } from '../../../config/env.config';
import { reasonOf } from '../../../core/errors/reason-of';
import { AIRateLimitService } from '../../ai/application/services/ai-rate-limit.service';
import { TierResolver } from '../../ai/application/services/tier-resolver.service';
import type { AiExecutionContext } from '../../ai/domain/execution-context/ai-execution-context';
import {
  AI_STRUCTURED_OUTPUT_PROVIDER,
  type AIStructuredOutputProvider,
  type StructuredOutputResult,
} from '../../ai/domain/ports/ai-structured-output.port';
import {
  EMBEDDING_PORT,
  type EmbeddingPort,
} from '../../ai/domain/ports/embedding.port';
import { TokenUsage } from '../../ai/domain/value-objects/token-usage.vo';
import {
  isRecallableMemory,
  isStorableMemory,
} from '../domain/memory-content-policy';
import {
  admitAdds,
  buildReconcilePrompt,
  MAX_DESTRUCTIVE_OPS_PER_RUN,
  MEMORY_RECONCILE_SYSTEM,
  MemoryReconcileSchema,
  partitionOps,
  screenDestructiveOps,
  type PartitionedOps,
} from '../domain/memory-reconcile';
import {
  memoryTranscriptOfWindow,
  type MemoryTaintReason,
  type MemoryTranscriptRow,
} from '../domain/memory-taint';
import {
  CONVERSATION_REPOSITORY,
  type ConversationRepository,
  type ExtractableConversation,
  type ExtractionCommitResult,
  type ExtractionScan,
} from '../domain/ports/conversation.repository';
import {
  MEMORY_REPOSITORY,
  type MemoryRepository,
} from '../domain/ports/memory.repository';
import {
  NOTE_EXPOSURE_REPOSITORY,
  type NoteExposureRepository,
} from '../domain/ports/note-exposure.repository';
import { toPromptLiteral } from '../domain/prompt-literal';
import { noteIdsInToolParts } from '../domain/tool-result-notes';
import { InjectionGuardService } from './injection-guard.service';

/** Rows read to decide whether a conversation is tainted; a longer conversation is treated as tainted unless earlier runs read the rows before them. */
export const TRANSCRIPT_ROW_WINDOW = 160;
const TRANSCRIPT_TEXT_ROWS = 40;
const MAX_OUTPUT_TOKENS = 1024;

/**
 * Memories are persisted as the user's data: a cross-family fallback would
 * store another model's judgement about which memories to keep, merge or
 * drop. Skipping a reconcile round (the conversation is retried after a
 * backoff) is cheaper than an inconsistent memory set.
 */
export const MEMORY_FALLBACK_SCOPE = 'same-family' as const;

const CANDIDATE_VERDICT = {
  kept: 'kept',
  rejectedByPolicy: 'policy',
  rejectedByGuard: 'guard',
  undecided: 'undecided',
} as const;
type CandidateVerdict =
  (typeof CANDIDATE_VERDICT)[keyof typeof CANDIDATE_VERDICT];

/** The persistent guard could not decide a candidate; the run fails so the conversation is retried rather than marked with facts dropped. */
export class MemoryScreeningUnavailableError extends Error {
  constructor() {
    super('The injection classifier could not decide a memory candidate');
    this.name = MemoryScreeningUnavailableError.name;
  }
}

export interface ExtractMemoriesInput {
  readonly conversation: ExtractableConversation;
  /** The model that reconciles the memories; fallback stays within its family. */
  readonly model: string;
  /** No retry follows a failure of this run: a candidate the classifier cannot decide is dropped instead of failing the run. */
  readonly finalAttempt: boolean;
}

export interface MemoryExtractionOutcome {
  readonly tainted: boolean;
  readonly taintReasons: readonly MemoryTaintReason[];
  /** The reconcile call as served; null when the conversation had no text and no model was called. */
  readonly reconcile: {
    readonly model: string;
    readonly inputTokens: number;
    readonly outputTokens: number;
  } | null;
}

interface EmbeddedPlan {
  readonly inserts: readonly { content: string; embedding: number[] }[];
  readonly updates: readonly {
    id: string;
    content: string;
    embedding: number[];
  }[];
  readonly deletes: readonly string[];
}

const NOTHING_APPLIED: EmbeddedPlan = {
  inserts: [],
  updates: [],
  deletes: [],
};
const NO_VERSIONS: ReadonlyMap<string, string> = new Map();

function withoutStale(
  plan: EmbeddedPlan,
  staleIds: readonly string[]
): EmbeddedPlan {
  const stale = new Set(staleIds);
  return {
    inserts: plan.inserts,
    updates: plan.updates.filter((update) => !stale.has(update.id)),
    deletes: plan.deletes.filter((id) => !stale.has(id)),
  };
}

interface ScreenedCandidates {
  readonly adds: readonly string[];
  readonly updates: readonly { id: string; content: string }[];
  readonly rejectedByPolicy: number;
  readonly rejectedByGuard: number;
  readonly undecided: number;
}

function opCounts(ops: {
  readonly adds: readonly unknown[];
  readonly updates: readonly unknown[];
  readonly deletes: readonly unknown[];
}): { adds: number; updates: number; deletes: number } {
  return {
    adds: ops.adds.length,
    updates: ops.updates.length,
    deletes: ops.deletes.length,
  };
}

function formatTranscript(rows: readonly MemoryTranscriptRow[]): string {
  return rows
    .map((row) => `${row.role}: ${toPromptLiteral(row.content)}`)
    .join('\n');
}

/**
 * Reconciles one conversation's durable facts into the owner's long-term memory and marks the
 * state it read as extracted. Only text the user could have written reaches the model once a
 * conversation is tainted, every stored fact passes the content policy and the persistent
 * injection guard, and a tainted or over-reaching run changes no existing memory.
 */
@Injectable()
export class ExtractMemoriesHandler {
  private readonly logger = new Logger(ExtractMemoriesHandler.name);

  constructor(
    private readonly config: ConfigService<EnvConfig, true>,
    @Inject(CONVERSATION_REPOSITORY)
    private readonly conversations: ConversationRepository,
    @Inject(MEMORY_REPOSITORY) private readonly memory: MemoryRepository,
    @Inject(AI_STRUCTURED_OUTPUT_PROVIDER)
    private readonly structured: AIStructuredOutputProvider,
    @Inject(EMBEDDING_PORT) private readonly embed: EmbeddingPort,
    private readonly rateLimit: AIRateLimitService,
    private readonly tierResolver: TierResolver,
    @Inject(MODEL_CATALOG) private readonly modelCatalog: ModelCatalog,
    private readonly injectionGuard: InjectionGuardService,
    @Inject(NOTE_EXPOSURE_REPOSITORY)
    private readonly noteExposure: NoteExposureRepository
  ) {}

  async execute({
    conversation,
    model,
    finalAttempt,
  }: ExtractMemoriesInput): Promise<MemoryExtractionOutcome> {
    const { id: conversationId, userId } = conversation;
    const window = await this.conversations.loadExtractionWindow(
      conversationId,
      userId,
      TRANSCRIPT_ROW_WINDOW
    );
    const noteExposures = await this.noteExposure.findExposures(
      userId,
      noteIdsInToolParts(window.rows)
    );
    const transcript = memoryTranscriptOfWindow(window, {
      textLimit: TRANSCRIPT_TEXT_ROWS,
      noteExposures,
    });
    const taint = {
      tainted: transcript.tainted,
      taintReasons: transcript.reasons,
    };
    if (transcript.rows.length === 0) {
      await this.commit(
        conversation,
        transcript.scan,
        NOTHING_APPLIED,
        NO_VERSIONS
      );
      return { ...taint, reconcile: null };
    }

    const max = this.config.get('AI_MEMORY_MAX_PER_USER');
    const stored = await this.memory.listForUser(userId, max);
    const existing = stored.filter((m) => isRecallableMemory(m.content));
    const execution = await this.tierResolver.resolve({
      userId,
      isAnonymous: false,
    });
    const result = await this.structured.generateStructuredOutput(
      buildReconcilePrompt(formatTranscript(transcript.rows), existing),
      MemoryReconcileSchema,
      {
        model,
        instructions: MEMORY_RECONCILE_SYSTEM,
        maxOutputTokens: MAX_OUTPUT_TOKENS,
        fallbackScope: MEMORY_FALLBACK_SCOPE,
      }
    );
    await this.meterReconcile(execution, userId, result);

    const proposed = partitionOps(
      result.object.operations,
      existing.map((m) => m.id)
    );
    const allowed = screenDestructiveOps(proposed, {
      tainted: transcript.tainted,
      maxDestructive: MAX_DESTRUCTIVE_OPS_PER_RUN,
    });
    const screened = await this.screenCandidates(
      allowed,
      execution,
      finalAttempt
    );
    const planned = await this.embedScreened({
      userId,
      execution,
      screened,
      deletes: allowed.deletes,
      max,
    });
    const outcome = await this.commit(
      conversation,
      transcript.scan,
      planned,
      new Map(existing.map((memory) => [memory.id, memory.version]))
    );
    const applied = outcome.committed
      ? withoutStale(planned, outcome.staleIds)
      : NOTHING_APPLIED;

    this.logger.log({
      event: 'agent.memory.candidates_screened',
      conversationId,
      taintReasons: transcript.reasons,
      withheldExisting: stored.length - existing.length,
      proposed: opCounts(proposed),
      rejected: {
        destructive:
          proposed.updates.length +
          proposed.deletes.length -
          allowed.updates.length -
          allowed.deletes.length,
        policy: screened.rejectedByPolicy,
        guard: screened.rejectedByGuard,
        undecided: screened.undecided,
        stale: outcome.staleIds.length,
      },
      applied: opCounts({ ...applied, adds: applied.inserts }),
    });
    return {
      ...taint,
      reconcile: {
        model: result.model,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
      },
    };
  }

  private async meterReconcile(
    execution: AiExecutionContext,
    userId: string,
    result: StructuredOutputResult<unknown>
  ): Promise<void> {
    try {
      await this.rateLimit.recordUsage(execution, null, {
        action: 'memory_extraction',
        model: result.model,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        costUsd: TokenUsage.create(
          {
            inputTokens: result.inputTokens,
            outputTokens: result.outputTokens,
            model: result.model,
          },
          this.modelCatalog.getPricing(result.model)
        ).costUsd,
      });
    } catch (error) {
      this.logger.warn({
        event: 'ai.usage.record_failed',
        userId,
        error: reasonOf(error),
      });
    }
  }

  private async screenCandidate(
    content: string,
    execution: AiExecutionContext,
    finalAttempt: boolean
  ): Promise<CandidateVerdict> {
    if (!isStorableMemory(content)) {
      return CANDIDATE_VERDICT.rejectedByPolicy;
    }
    const verdict = await this.injectionGuard.guardPersistent(
      content,
      execution
    );
    if (verdict.degraded) {
      if (finalAttempt) {
        return CANDIDATE_VERDICT.undecided;
      }
      throw new MemoryScreeningUnavailableError();
    }
    return verdict.safe
      ? CANDIDATE_VERDICT.kept
      : CANDIDATE_VERDICT.rejectedByGuard;
  }

  private async screenCandidates(
    ops: PartitionedOps,
    execution: AiExecutionContext,
    finalAttempt: boolean
  ): Promise<ScreenedCandidates> {
    const contents = [...ops.adds, ...ops.updates.map((u) => u.content)];
    const verdicts = await Promise.all(
      contents.map((content) =>
        this.screenCandidate(content, execution, finalAttempt)
      )
    );
    const addVerdicts = verdicts.slice(0, ops.adds.length);
    const updateVerdicts = verdicts.slice(ops.adds.length);
    const count = (rejection: CandidateVerdict) =>
      verdicts.filter((verdict) => verdict === rejection).length;
    return {
      adds: ops.adds.filter(
        (_, i) => addVerdicts[i] === CANDIDATE_VERDICT.kept
      ),
      updates: ops.updates.filter(
        (_, i) => updateVerdicts[i] === CANDIDATE_VERDICT.kept
      ),
      rejectedByPolicy: count(CANDIDATE_VERDICT.rejectedByPolicy),
      rejectedByGuard: count(CANDIDATE_VERDICT.rejectedByGuard),
      undecided: count(CANDIDATE_VERDICT.undecided),
    };
  }

  private async commit(
    { id: conversationId, userId, version }: ExtractableConversation,
    scan: ExtractionScan,
    plan: EmbeddedPlan,
    versions: ReadonlyMap<string, string>
  ): Promise<ExtractionCommitResult> {
    const result = await this.conversations.commitExtraction({
      userId,
      conversationId,
      version,
      deletes: plan.deletes.flatMap((id) => {
        const read = versions.get(id);
        return read === undefined ? [] : [{ id, version: read }];
      }),
      inserts: plan.inserts,
      updates: plan.updates.flatMap((update) => {
        const read = versions.get(update.id);
        return read === undefined ? [] : [{ ...update, version: read }];
      }),
      scan,
    });
    if (!result.committed) {
      this.logger.log({
        event: 'agent.memory.extraction_paused',
        conversationId,
      });
    }
    return result;
  }

  private async embedScreened({
    userId,
    execution,
    screened,
    deletes,
    max,
  }: {
    readonly userId: string;
    readonly execution: AiExecutionContext;
    readonly screened: ScreenedCandidates;
    readonly deletes: readonly string[];
    readonly max: number;
  }): Promise<EmbeddedPlan> {
    const adds =
      screened.adds.length > 0
        ? admitAdds(screened.adds, {
            max,
            stored: await this.memory.countForUser(userId),
            deleting: deletes.length,
          })
        : [];
    const inserts: { content: string; embedding: number[] }[] = [];
    const updates: { id: string; content: string; embedding: number[] }[] = [];
    // Compute every fallible external value (embeddings) before any write so
    // commitExtraction commits delete/insert/update atomically or not at all.
    if (adds.length + screened.updates.length > 0) {
      const { embeddings, costUsd } = await this.embed.embedDocuments([
        ...adds,
        ...screened.updates.map((u) => u.content),
      ]);
      await this.rateLimit.recordSideCost(execution, {
        action: 'embedding',
        model: this.config.get('AI_EMBEDDING_MODEL'),
        costUsd,
      });
      adds.forEach((content, i) => {
        const embedding = embeddings[i];
        if (embedding) {
          inserts.push({ content, embedding });
        }
      });
      screened.updates.forEach((u, i) => {
        const embedding = embeddings[adds.length + i];
        if (embedding) {
          updates.push({ id: u.id, content: u.content, embedding });
        }
      });
    }
    return { inserts, updates, deletes };
  }
}
