import {
  deriveCanonical,
  ModelIndexCatalog,
  MODELS_DEV_PROVIDERS,
  type IndexedModel,
} from '@jovandyaz/llm-router';

import { slugOf } from '../domain/model-catalog/catalog-model';
import { createIndexedModel } from './create-indexed-model';

type RouteFields = Partial<IndexedModel> & { readonly id: string };

/** One model: what its routes share, and each route's id with the fields only that route carries. */
interface FixtureModel extends Omit<Partial<IndexedModel>, 'id' | 'family'> {
  readonly releasedAt: string;
  readonly routes: readonly RouteFields[];
}

/** The day the fixture index's selector resolutions are pinned to. */
export const FIXTURE_DATE = new Date('2026-10-01T00:00:00Z');

const FULL_LADDER = ['low', 'medium', 'high', 'xhigh', 'max'];
// Upstream OpenRouter order, highest first: the picker must reorder it.
const OPENROUTER_FULL_LADDER = FULL_LADDER.toReversed();

/** A models.dev row when the id names a direct provider, else an OpenRouter one; its canonical is derived as the index derives it, so a model's routes share one. */
function routeRow(fields: RouteFields): IndexedModel {
  const slug = slugOf(fields.id);
  const direct = MODELS_DEV_PROVIDERS.find((provider) =>
    fields.id.startsWith(`${provider}:`)
  );
  return createIndexedModel(
    direct === undefined
      ? { canonical: deriveCanonical(slug), ...fields }
      : {
          provider: direct,
          source: 'models_dev',
          canonical: deriveCanonical(`${direct}/${slug}`),
          ...fields,
        }
  );
}

function familyRows(
  family: string,
  models: readonly FixtureModel[]
): IndexedModel[] {
  return models.flatMap(({ routes, ...model }) =>
    routes.map((route) => routeRow({ ...model, family, ...route }))
  );
}

/** A hand-built model index whose selector resolutions do not move when the vendored snapshot refreshes. */
export const FIXTURE_INDEX: readonly IndexedModel[] = [
  ...familyRows('claude-haiku', [
    {
      releasedAt: '2025-10-15',
      routes: [
        {
          id: 'anthropic:claude-haiku-4-5',
          name: 'Claude Haiku 4.5 (latest)',
          reasoning: { levels: [], mandatory: true },
        },
        { id: 'anthropic:claude-haiku-4-5-20251001' },
        { id: 'openrouter:anthropic/claude-haiku-4.5' },
      ],
    },
  ]),
  ...familyRows('claude-sonnet', [
    {
      releasedAt: '2026-09-28',
      routes: [
        {
          id: 'anthropic:claude-sonnet-5-5',
          name: 'Claude Sonnet 5.5',
          reasoning: { levels: FULL_LADDER, mandatory: true },
        },
        {
          id: 'openrouter:anthropic/claude-sonnet-5.5',
          name: 'Anthropic: Claude Sonnet 5.5',
          reasoning: { levels: OPENROUTER_FULL_LADDER, mandatory: true },
        },
      ],
    },
    {
      releasedAt: '2026-06-29',
      routes: [
        { id: 'anthropic:claude-sonnet-5' },
        { id: 'openrouter:anthropic/claude-sonnet-5' },
      ],
    },
  ]),
  ...familyRows('claude-opus', [
    {
      releasedAt: '2026-09-22',
      routes: [
        {
          id: 'anthropic:claude-opus-5-5',
          name: 'Claude Opus 5.5',
          reasoning: { levels: FULL_LADDER, mandatory: true },
        },
        { id: 'openrouter:anthropic/claude-opus-5.5' },
      ],
    },
  ]),
  ...familyRows('gpt-luna', [
    {
      releasedAt: '2026-09-22',
      routes: [
        {
          id: 'openai:gpt-6-luna',
          reasoning: { levels: ['none', ...FULL_LADDER], mandatory: true },
        },
        {
          id: 'openrouter:openai/gpt-6-luna',
          reasoning: { levels: OPENROUTER_FULL_LADDER, mandatory: false },
        },
      ],
    },
  ]),
  ...familyRows('gpt-terra', [
    {
      releasedAt: '2026-07-09',
      routes: [
        { id: 'openai:gpt-5.6-terra' },
        {
          id: 'openrouter:openai/gpt-5.6-terra',
          name: 'OpenAI: GPT-5.6 Terra',
        },
        // Upstream files the Pro SKU under its base model, so it is no plain route of it.
        {
          id: 'openrouter:openai/gpt-5.6-terra-pro',
          canonical: 'openai/gpt-5-6-terra',
        },
      ],
    },
  ]),
  ...familyRows('gpt-sol', [
    {
      releasedAt: '2026-09-29',
      routes: [
        { id: 'openai:gpt-6.1-sol' },
        { id: 'openrouter:openai/gpt-6.1-sol' },
      ],
    },
  ]),
  ...familyRows('gemini-flash-lite', [
    {
      releasedAt: '2026-07-21',
      routes: [
        { id: 'google:gemini-3.5-flash-lite' },
        { id: 'openrouter:google/gemini-3.5-flash-lite' },
      ],
    },
    {
      releasedAt: '2026-03-03',
      status: 'deprecated',
      routes: [{ id: 'google:gemini-3.1-flash-lite-preview' }],
    },
  ]),
  ...familyRows('gemini-flash', [
    {
      releasedAt: '2026-09-02',
      routes: [
        { id: 'google:gemini-3.8-flash' },
        { id: 'openrouter:google/gemini-3.8-flash' },
      ],
    },
  ]),
  ...familyRows('gemini-pro', [
    {
      releasedAt: '2026-02-19',
      routes: [
        { id: 'google:gemini-3.1-pro-preview' },
        { id: 'openrouter:google/gemini-3.1-pro-preview' },
      ],
    },
    {
      releasedAt: '2026-02-25',
      routes: [{ id: 'openrouter:google/gemini-3.1-pro-preview-customtools' }],
    },
    {
      releasedAt: '2025-06-17',
      routes: [
        { id: 'google:gemini-2.5-pro' },
        // Retires inside the window at FIXTURE_DATE, so stable gemini-pro resolves to nothing on OpenRouter.
        { id: 'openrouter:google/gemini-2.5-pro', retiresAt: '2026-10-20' },
      ],
    },
  ]),

  ...familyRows('deepseek-flash', [
    {
      releasedAt: '2026-09-10',
      routes: [{ id: 'openrouter:deepseek/deepseek-v4.1-flash' }],
    },
    {
      // Newer than v4.1-flash, so only its -vision and -exp tokens keep it from serving platform fast.
      releasedAt: '2026-09-20',
      routes: [{ id: 'openrouter:deepseek/deepseek-v4-flash-vision-exp' }],
    },
  ]),
  ...familyRows('deepseek-thinking', [
    {
      releasedAt: '2026-08-12',
      routes: [{ id: 'openrouter:deepseek/deepseek-v4-pro-0813' }],
    },
    {
      releasedAt: '2026-04-24',
      routes: [{ id: 'openrouter:deepseek/deepseek-v4-pro' }],
    },
  ]),
  // Upstream files Z.ai's served GLM rows under zhipuai, so neither is a plain route of its canonical.
  ...familyRows('glm', [
    {
      releasedAt: '2026-08-18',
      routes: [{ id: 'openrouter:z-ai/glm-5.3', canonical: 'zhipuai/glm-5-3' }],
    },
    {
      releasedAt: '2026-09-18',
      routes: [{ id: 'openrouter:z-ai/glm-5.3-flashx' }],
    },
    {
      // Above the platform powerful ceiling but under twice it, so only its price keeps it from serving.
      releasedAt: '2026-09-23',
      inputCostPerToken: 2.8e-6,
      outputCostPerToken: 8.8e-6,
      routes: [{ id: 'openrouter:z-ai/glm-5.3-prime' }],
    },
    {
      releasedAt: '2026-06-16',
      routes: [
        {
          id: 'openrouter:z-ai/glm-5.2',
          canonical: 'zhipuai/glm-5-2',
          name: 'Z.ai: GLM 5.2',
          reasoning: { levels: ['xhigh', 'high'], mandatory: false },
        },
      ],
    },
  ]),

  ...familyRows('minimax', [
    {
      releasedAt: '2026-02-12',
      routes: [{ id: 'openrouter:minimax/minimax-m2.5' }],
    },
    {
      releasedAt: '2026-01-23',
      routes: [{ id: 'openrouter:minimax/minimax-m2-her' }],
    },
  ]),
  ...familyRows('deepseek', [
    {
      releasedAt: '2025-12-01',
      routes: [
        {
          id: 'openrouter:deepseek/deepseek-v3.2',
          name: 'DeepSeek: DeepSeek V3.2',
          reasoning: { levels: [], mandatory: false },
        },
      ],
    },
  ]),
  ...familyRows('kimi-k2', [
    {
      releasedAt: '2026-01-27',
      routes: [{ id: 'openrouter:moonshotai/kimi-k2.5' }],
    },
    {
      releasedAt: '2026-04-20',
      routes: [{ id: 'openrouter:moonshotai/kimi-k2.6' }],
    },
    {
      releasedAt: '2026-06-12',
      routes: [{ id: 'openrouter:moonshotai/kimi-k2.7-code' }],
    },
  ]),

  // Unlisted families priced under their author's ceilings, so only being older than what the
  // author serves keeps the family-drift watch quiet.
  ...familyRows('claude-fable', [
    {
      releasedAt: '2026-09-01',
      routes: [{ id: 'anthropic:claude-fable-5-1' }],
    },
  ]),
  ...familyRows('gpt', [
    { releasedAt: '2026-03-05', routes: [{ id: 'openai:gpt-5.4' }] },
  ]),
  ...familyRows('gemma', [
    {
      releasedAt: '2026-04-02',
      routes: [{ id: 'openrouter:google/gemma-4-31b-it' }],
    },
  ]),
];

export const FIXTURE_CATALOG = new ModelIndexCatalog(FIXTURE_INDEX);

export function fixtureRow(id: string): IndexedModel {
  const row = FIXTURE_INDEX.find((model) => model.id === id);
  if (row === undefined) {
    throw new Error(`${id} is not in the fixture index`);
  }
  return row;
}
