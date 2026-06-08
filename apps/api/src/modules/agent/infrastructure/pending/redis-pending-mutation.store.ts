import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { EnvConfig } from '../../../../config/env.config';
import {
  AI_REDIS,
  AIRedisProvider,
} from '../../../ai/infrastructure/redis/ai-redis.provider';
import type {
  PendingMutationRecord,
  PendingMutationStore,
} from '../../domain/ports/pending-mutation.store';
import { ProposedMutation } from '../../domain/proposed-mutation';

const KEY_PREFIX = 'agent:proposal:';

interface SerializedRecord {
  userId: string;
  toolName: string;
  mutation: {
    id: string;
    kind: ProposedMutation['kind'];
    targetNoteId?: string;
    payload: ProposedMutation['payload'];
    summary: string;
    previewHtml?: string;
    baseVersion?: string;
  };
}

@Injectable()
export class RedisPendingMutationStore implements PendingMutationStore {
  private readonly ttl: number;

  constructor(
    @Inject(AI_REDIS) private readonly redis: AIRedisProvider,
    configService: ConfigService<EnvConfig, true>
  ) {
    this.ttl = configService.get('AI_AGENT_PROPOSAL_TTL_SECONDS');
  }

  async save(record: PendingMutationRecord): Promise<void> {
    const serialized: SerializedRecord = {
      userId: record.userId,
      toolName: record.toolName,
      mutation: {
        id: record.mutation.id,
        kind: record.mutation.kind,
        ...(record.mutation.targetNoteId && {
          targetNoteId: record.mutation.targetNoteId,
        }),
        payload: record.mutation.payload,
        summary: record.mutation.summary,
        ...(record.mutation.previewHtml && {
          previewHtml: record.mutation.previewHtml,
        }),
        ...(record.mutation.baseVersion && {
          baseVersion: record.mutation.baseVersion,
        }),
      },
    };
    await this.redis.client.set(
      `${KEY_PREFIX}${record.mutation.id}`,
      JSON.stringify(serialized),
      'EX',
      this.ttl
    );
  }

  async take(
    proposalId: string,
    userId: string
  ): Promise<PendingMutationRecord | null> {
    const raw = await this.redis.client.get(`${KEY_PREFIX}${proposalId}`);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as SerializedRecord;
    if (parsed.userId !== userId) {
      return null;
    }
    await this.redis.client.del(`${KEY_PREFIX}${proposalId}`);
    const rebuilt = ProposedMutation.create(parsed.mutation);
    if (rebuilt.isErr()) {
      return null;
    }
    return {
      userId: parsed.userId,
      toolName: parsed.toolName,
      mutation: rebuilt.value,
    };
  }
}
