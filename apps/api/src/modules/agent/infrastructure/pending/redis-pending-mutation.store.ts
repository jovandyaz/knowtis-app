import { Inject, Injectable, Logger } from '@nestjs/common';
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
  private static readonly TAKE_SCRIPT = `
local v = redis.call('GET', KEYS[1])
if not v then return false end
local ok, parsed = pcall(cjson.decode, v)
if not ok then return false end
if parsed.userId ~= ARGV[1] then return 'MISMATCH' end
redis.call('DEL', KEYS[1])
return v
`;

  private readonly logger = new Logger(RedisPendingMutationStore.name);
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
        ...(record.mutation.kind !== 'create' && {
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
    const res = (await this.redis.client.eval(
      RedisPendingMutationStore.TAKE_SCRIPT,
      1,
      `${KEY_PREFIX}${proposalId}`,
      userId
    )) as string | 'MISMATCH' | null;
    if (!res || res === 'MISMATCH') {
      return null;
    }
    let parsed: SerializedRecord;
    try {
      parsed = JSON.parse(res) as SerializedRecord;
    } catch (error) {
      this.logger.warn(
        `Failed to parse pending mutation ${proposalId}: ${error instanceof Error ? error.message : 'unknown'}`
      );
      return null;
    }
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
