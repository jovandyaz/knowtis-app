import { ConfigService } from '@nestjs/config';
import { describe, expect, it, vi } from 'vitest';

import type { EnvConfig } from '../../../../config/env.config';
import type { EmbeddingPort } from '../../../ai/domain/ports/embedding.port';
import type {
  NoteEmbeddingRepository,
  StaleNote,
} from '../../domain/ports/note-embedding.repository';
import { EmbeddingReconcileTask } from './embedding-reconcile.task';
import { embeddingInputHash } from './embedding-text';

function makeTask(opts: {
  stale: StaleNote[];
  lock?: boolean;
  voyageKey?: string | undefined;
}): {
  task: EmbeddingReconcileTask;
  repo: NoteEmbeddingRepository;
  embed: EmbeddingPort;
} {
  const voyageKey = 'voyageKey' in opts ? opts.voyageKey : 'test-key';
  const repo = {
    findStaleNotes: vi.fn(async () => opts.stale),
    upsert: vi.fn(async () => undefined),
    touch: vi.fn(async () => undefined),
  } as unknown as NoteEmbeddingRepository;
  const embed = {
    embedQuery: vi.fn(),
    embedDocuments: vi.fn(async (texts: string[]) => ({
      embeddings: texts.map(() => new Array(1024).fill(0.1)),
      totalTokens: 5,
    })),
  } as unknown as EmbeddingPort;
  const db = {
    execute: vi.fn(async () => [{ locked: opts.lock ?? true }]),
  };
  const config = {
    get: (k: string) => {
      if (k === 'AI_EMBEDDING_MODEL') {
        return 'voyage-4';
      }
      if (k === 'VOYAGE_API_KEY') {
        return voyageKey;
      }
      return undefined;
    },
  } as unknown as ConfigService<EnvConfig, true>;
  const task = new EmbeddingReconcileTask(db as never, config, repo, embed);
  return { task, repo, embed };
}

describe('EmbeddingReconcileTask', () => {
  it('embeds and upserts a stale note whose hash changed', async () => {
    const { task, repo, embed } = makeTask({
      stale: [{ noteId: 'n1', title: 't', content: 'c', inputHash: 'old' }],
    });
    await task.reconcile();
    expect(embed.embedDocuments).toHaveBeenCalledOnce();
    expect(repo.upsert).toHaveBeenCalledOnce();
    expect(repo.touch).not.toHaveBeenCalled();
  });

  it('skips embedding and only touches when the hash is unchanged', async () => {
    const hash = embeddingInputHash('t', 'c', 'voyage-4');
    const { task, repo, embed } = makeTask({
      stale: [{ noteId: 'n1', title: 't', content: 'c', inputHash: hash }],
    });
    await task.reconcile();
    expect(embed.embedDocuments).not.toHaveBeenCalled();
    expect(repo.touch).toHaveBeenCalledWith('n1');
  });

  it('does nothing when the advisory lock is not acquired', async () => {
    const { task, repo } = makeTask({
      stale: [{ noteId: 'n1', title: 't', content: 'c', inputHash: 'old' }],
      lock: false,
    });
    await task.reconcile();
    expect(repo.findStaleNotes).not.toHaveBeenCalled();
  });

  it('does nothing when VOYAGE_API_KEY is not set', async () => {
    const { task, repo } = makeTask({
      stale: [{ noteId: 'n1', title: 't', content: 'c', inputHash: 'old' }],
      voyageKey: undefined,
    });
    await task.reconcile();
    expect(repo.findStaleNotes).not.toHaveBeenCalled();
  });

  it('skips upsert when the embedding provider returns nothing', async () => {
    const { task, repo, embed } = makeTask({
      stale: [{ noteId: 'n1', title: 't', content: 'c', inputHash: 'old' }],
    });
    vi.mocked(embed.embedDocuments).mockResolvedValueOnce({
      embeddings: [],
      totalTokens: 0,
    });
    await task.reconcile();
    expect(repo.upsert).not.toHaveBeenCalled();
  });

  it('embeds all changed notes in a single provider call', async () => {
    const { task, repo, embed } = makeTask({
      stale: [
        { noteId: 'n1', title: 't1', content: 'c1', inputHash: 'old' },
        { noteId: 'n2', title: 't2', content: 'c2', inputHash: 'old' },
        { noteId: 'n3', title: 't3', content: 'c3', inputHash: 'old' },
      ],
    });
    await task.reconcile();
    expect(embed.embedDocuments).toHaveBeenCalledOnce();
    expect(vi.mocked(embed.embedDocuments).mock.calls[0][0]).toHaveLength(3);
    expect(repo.upsert).toHaveBeenCalledTimes(3);
  });

  it('logs and skips a failed embedding batch without aborting the cycle', async () => {
    const { task, repo, embed } = makeTask({
      stale: [
        { noteId: 'n1', title: 't1', content: 'c1', inputHash: 'old' },
        { noteId: 'n2', title: 't2', content: 'c2', inputHash: 'old' },
      ],
    });
    vi.mocked(embed.embedDocuments).mockRejectedValueOnce(
      new Error('voyage down')
    );
    await expect(task.reconcile()).resolves.toBeUndefined();
    expect(repo.upsert).not.toHaveBeenCalled();
  });

  it('continues to later chunks when an earlier embedding batch fails', async () => {
    const stale = Array.from({ length: 40 }, (_, i) => ({
      noteId: `n${i}`,
      title: `t${i}`,
      content: `c${i}`,
      inputHash: 'old',
    }));
    const { task, repo, embed } = makeTask({ stale });
    vi.mocked(embed.embedDocuments).mockRejectedValueOnce(
      new Error('voyage 429')
    );
    await task.reconcile();
    expect(embed.embedDocuments).toHaveBeenCalledTimes(2);
    expect(repo.upsert).toHaveBeenCalledTimes(8);
  });

  it('counts only persisted upserts when a single write fails', async () => {
    const { task, repo } = makeTask({
      stale: [
        { noteId: 'n1', title: 't1', content: 'c1', inputHash: 'old' },
        { noteId: 'n2', title: 't2', content: 'c2', inputHash: 'old' },
      ],
    });
    vi.mocked(repo.upsert).mockRejectedValueOnce(new Error('db write failed'));
    await expect(task.reconcile()).resolves.toBeUndefined();
    expect(repo.upsert).toHaveBeenCalledTimes(2);
  });
});
