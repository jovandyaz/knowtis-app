import { describe, expect, it } from 'vitest';

import {
  MODEL_INDEX_SNAPSHOT_DATE,
  type IndexedModel,
} from '@knowtis/ai-gateway';

import { createIndexedModel } from '../../testing/create-indexed-model';
import { seededResolution } from '../../testing/platform-resolutions';
import {
  createSnapshotIndex,
  SNAPSHOT_DATE,
} from '../../testing/snapshot-index';
import { AUTO_MODEL_SETTING } from '../ai-settings';
import {
  findFamilyDrift,
  findPinUnavailable,
  findRetirementScheduled,
  findStaleSync,
} from './model-watch';
import { PLATFORM_SEED_MODELS, SEED_RESOLUTIONS } from './platform-resolution';

const ROWS = createSnapshotIndex().catalog().all();
const LISTED_IDS: ReadonlySet<string> = new Set(ROWS.map((row) => row.id));

function rowWhere(predicate: (row: IndexedModel) => boolean): IndexedModel {
  const row = ROWS.find(predicate);
  if (!row) {
    throw new Error('the snapshot has no row the watch spec needs');
  }
  return row;
}

const LISTED_PIN = PLATFORM_SEED_MODELS.balanced;
const LISTED_CHAIN_ID = PLATFORM_SEED_MODELS.fast;
const DEAD_PIN = 'openrouter:qwen/qwen3-max-2026-01-23';
const DEAD_CHAIN_ID = 'anthropic:claude-3-opus-20240229';

describe('findPinUnavailable', () => {
  it('flags a pinned model missing from the index', () => {
    expect(LISTED_IDS.has(DEAD_PIN)).toBe(false);

    expect(findPinUnavailable([DEAD_PIN], LISTED_IDS)).toEqual([
      {
        subject: DEAD_PIN,
        kind: 'pin_unavailable',
        detail: expect.stringContaining(DEAD_PIN),
      },
    ]);
  });

  it('flags a chain id missing from the index', () => {
    expect(LISTED_IDS.has(DEAD_CHAIN_ID)).toBe(false);

    expect(
      findPinUnavailable(
        [LISTED_PIN, LISTED_CHAIN_ID, DEAD_CHAIN_ID],
        LISTED_IDS
      )
    ).toEqual([
      {
        subject: DEAD_CHAIN_ID,
        kind: 'pin_unavailable',
        detail: expect.stringContaining(DEAD_CHAIN_ID),
      },
    ]);
  });

  it('ignores the auto setting', () => {
    expect(
      findPinUnavailable([AUTO_MODEL_SETTING, LISTED_PIN], LISTED_IDS)
    ).toEqual([]);
  });

  it('reports a dead id that is both pinned and chained once', () => {
    expect(findPinUnavailable([DEAD_PIN, DEAD_PIN], LISTED_IDS)).toHaveLength(
      1
    );
  });
});

describe('findRetirementScheduled', () => {
  const RETIRING = rowWhere((row) => row.retiresAt !== null);
  const LASTING = rowWhere((row) => row.retiresAt === null);

  it('flags a watched model with a retirement date', () => {
    expect(findRetirementScheduled([RETIRING.id], ROWS)).toEqual([
      {
        subject: RETIRING.id,
        kind: 'retirement_scheduled',
        detail: expect.stringContaining(String(RETIRING.retiresAt)),
      },
    ]);
  });

  it('ignores a model without one', () => {
    expect(findRetirementScheduled([LASTING.id], ROWS)).toEqual([]);
  });

  it('ignores a watched id the index does not list', () => {
    expect(findRetirementScheduled([DEAD_PIN], ROWS)).toEqual([]);
  });

  it('reports a model watched twice once', () => {
    expect(
      findRetirementScheduled([RETIRING.id, RETIRING.id], ROWS)
    ).toHaveLength(1);
  });
});

describe('findFamilyDrift', () => {
  const RELEASED_TODAY = MODEL_INDEX_SNAPSHOT_DATE;
  const UNLISTED_FAMILY = 'deepseek-ultra';
  const DEEPSEEK_ACTIVE = rowWhere(
    (row) => row.id === PLATFORM_SEED_MODELS.balanced
  );

  function newcomer(overrides: Partial<IndexedModel> = {}): IndexedModel {
    return createIndexedModel({
      id: 'openrouter:deepseek/deepseek-v9-ultra',
      family: UNLISTED_FAMILY,
      releasedAt: RELEASED_TODAY,
      ...overrides,
    });
  }

  it('flags an eligible newer model whose family no selector lists', () => {
    const model = newcomer();

    expect(
      findFamilyDrift([...ROWS, model], SEED_RESOLUTIONS, SNAPSHOT_DATE)
    ).toEqual([
      {
        subject: model.id,
        kind: 'family_drift',
        detail: `new ${UNLISTED_FAMILY} family from deepseek`,
      },
    ]);
  });

  it('ignores a newer model in a listed family', () => {
    const model = newcomer({ family: 'deepseek-flash' });

    expect(
      findFamilyDrift([...ROWS, model], SEED_RESOLUTIONS, SNAPSHOT_DATE)
    ).toEqual([]);
  });

  it('ignores an ineligible newer model', () => {
    const model = newcomer({ toolCall: false });

    expect(
      findFamilyDrift([...ROWS, model], SEED_RESOLUTIONS, SNAPSHOT_DATE)
    ).toEqual([]);
  });

  it('ignores a model no newer than the active resolution of its author', () => {
    const model = newcomer({ releasedAt: DEEPSEEK_ACTIVE.releasedAt });

    expect(
      findFamilyDrift([...ROWS, model], SEED_RESOLUTIONS, SNAPSHOT_DATE)
    ).toEqual([]);
  });

  it('ignores an undated model', () => {
    const model = newcomer({ releasedAt: null });

    expect(
      findFamilyDrift([...ROWS, model], SEED_RESOLUTIONS, SNAPSHOT_DATE)
    ).toEqual([]);
  });

  it('ignores a model with no family', () => {
    const model = newcomer({ family: null });

    expect(
      findFamilyDrift([...ROWS, model], SEED_RESOLUTIONS, SNAPSHOT_DATE)
    ).toEqual([]);
  });

  it('stays quiet for an author with no served model', () => {
    const resolutions = SEED_RESOLUTIONS.filter(
      (row) => row.activeModelId !== DEEPSEEK_ACTIVE.id
    );

    expect(
      findFamilyDrift([...ROWS, newcomer()], resolutions, SNAPSHOT_DATE)
    ).toEqual([]);
  });

  it('ignores an author no selector picks from', () => {
    const model = newcomer({
      id: 'openrouter:moonshotai/kimi-k9',
      family: 'kimi-k9',
    });

    expect(
      findFamilyDrift([...ROWS, model], SEED_RESOLUTIONS, SNAPSHOT_DATE)
    ).toEqual([]);
  });

  it('stays quiet over the snapshot, whose older BYOK-author families no selector lists', () => {
    expect(findFamilyDrift(ROWS, SEED_RESOLUTIONS, SNAPSHOT_DATE)).toEqual([]);
  });

  it('flags a BYOK-author model newer than every current pick of its selectors', () => {
    const model = newcomer({
      id: 'openai:gpt-9-nova',
      provider: 'openai',
      family: 'gpt-nova',
      source: 'models_dev',
    });

    expect(
      findFamilyDrift([...ROWS, model], SEED_RESOLUTIONS, SNAPSHOT_DATE)
    ).toEqual([
      {
        subject: model.id,
        kind: 'family_drift',
        detail: 'new gpt-nova family from openai',
      },
    ]);
  });

  it('stays quiet while an active resolution of the author has no known release date', () => {
    const resolutions = [
      ...SEED_RESOLUTIONS.filter(
        (row) => row.activeModelId !== DEEPSEEK_ACTIVE.id
      ),
      seededResolution('balanced', {
        activeModelId: 'openrouter:deepseek/deepseek-delisted',
      }),
    ];

    expect(
      findFamilyDrift([...ROWS, newcomer()], resolutions, SNAPSHOT_DATE)
    ).toEqual([]);
  });
});

describe('findStaleSync', () => {
  const MS_PER_HOUR = 3_600_000;
  const HOURS_PAST_WINDOW = 49;
  const HOURS_WITHIN_WINDOW = 47;
  const WINDOW_HOURS = 48;

  function hoursBefore(hours: number): Date {
    return new Date(SNAPSHOT_DATE.getTime() - hours * MS_PER_HOUR);
  }

  it('flags a sync older than 48 hours', () => {
    const lastSeenAt = hoursBefore(HOURS_PAST_WINDOW);

    expect(findStaleSync(lastSeenAt, SNAPSHOT_DATE)).toEqual({
      subject: 'openrouter',
      kind: 'sync_stale',
      detail: expect.stringContaining(lastSeenAt.toISOString()),
    });
  });

  it('flags a missing sync', () => {
    expect(findStaleSync(null, SNAPSHOT_DATE)).toEqual({
      subject: 'openrouter',
      kind: 'sync_stale',
      detail: expect.any(String),
    });
  });

  it('stays quiet for a sync within the window', () => {
    expect(
      findStaleSync(hoursBefore(HOURS_WITHIN_WINDOW), SNAPSHOT_DATE)
    ).toBeNull();
    expect(findStaleSync(hoursBefore(WINDOW_HOURS), SNAPSHOT_DATE)).toBeNull();
  });
});
