import {
  OPENROUTER_PROVIDER,
  TOKENS_PER_MILLION,
  type IndexedModel,
  type IndexProvider,
  type MODELS_DEV_PROVIDERS,
  type ModelStatus,
} from '@knowtis/ai-gateway';
import {
  MODEL_INTENTS,
  type ByokProvider,
  type ModelIntent,
} from '@knowtis/shared-types';

import type { OPEN_WEIGHT_AUTHORS } from './candidate-filter';

type DirectProvider = (typeof MODELS_DEV_PROVIDERS)[number];

const ANTHROPIC = 'anthropic' satisfies DirectProvider;
const OPENAI = 'openai' satisfies DirectProvider;
const GOOGLE = 'google' satisfies DirectProvider;

export type OpenWeightAuthor = (typeof OPEN_WEIGHT_AUTHORS)[number];
export type SelectorCapability = 'tool_call' | 'structured_output';

/** The part of eligibility a caller tunes; the rest applies to every row. */
export interface EligibilityRule {
  readonly requires: readonly SelectorCapability[];
  readonly allowPreview?: true;
  /** USD per million output tokens; absent means no ceiling. */
  readonly maxOutputCostPerMillion?: number;
}

/** A code-owned rule that resolves one intent on one provider. */
export interface ModelSelector extends EligibilityRule {
  readonly author:
    | typeof ANTHROPIC
    | typeof OPENAI
    | typeof GOOGLE
    | OpenWeightAuthor;
  readonly families: readonly string[];
  readonly maxOutputCostPerMillion: number;
}

export const RETIREMENT_WINDOW_DAYS = 30;

export const EXCLUDED_STATUSES: readonly ModelStatus[] = [
  'deprecated',
  'alpha',
];
export const EXCLUDED_ID_TOKENS = [
  '-code',
  '-image',
  '-tts',
  '-live',
  '-vision',
  '-exp',
  '-customtools',
  '-her',
  '-batch',
  '-latest',
] as const;

export const FAST_CEILING_PER_MILLION = 6;
export const BALANCED_CEILING_PER_MILLION = 15;
export const POWERFUL_CEILING_PER_MILLION = 30;

const MS_PER_DAY = 86_400_000;
const ALIAS_PREFIX = '~';
const VARIANT_SEPARATOR = ':';
const PREVIEW_TOKEN = '-preview';
const TEXT_MODALITY = 'text';
const AUTHOR_SEPARATOR = '/';
const START_OF_DAY_UTC = 'T00:00:00Z';

const BYOK_REQUIRES: readonly SelectorCapability[] = [
  'tool_call',
  'structured_output',
];

/** What an admin may pin as a platform default: any eligible row that can call tools and emit structured output. */
export const ASSIGNABLE_RULE: EligibilityRule = {
  requires: ['tool_call', 'structured_output'],
  allowPreview: true,
};

const CAPABILITY_FLAG = {
  tool_call: 'toolCall',
  structured_output: 'structuredOutput',
} as const satisfies Record<SelectorCapability, keyof IndexedModel>;

/** Ordered per intent: the first candidate any held key serves wins. */
export const BYOK_SELECTORS: Readonly<
  Record<ModelIntent, readonly ModelSelector[]>
> = {
  fast: [
    {
      author: ANTHROPIC,
      families: ['claude-haiku'],
      maxOutputCostPerMillion: FAST_CEILING_PER_MILLION,
      requires: BYOK_REQUIRES,
    },
    {
      author: OPENAI,
      families: ['gpt-luna'],
      maxOutputCostPerMillion: FAST_CEILING_PER_MILLION,
      requires: BYOK_REQUIRES,
    },
    {
      author: GOOGLE,
      families: ['gemini-flash-lite'],
      maxOutputCostPerMillion: FAST_CEILING_PER_MILLION,
      requires: BYOK_REQUIRES,
    },
  ],
  balanced: [
    {
      author: ANTHROPIC,
      families: ['claude-sonnet'],
      maxOutputCostPerMillion: BALANCED_CEILING_PER_MILLION,
      requires: BYOK_REQUIRES,
    },
    {
      author: OPENAI,
      families: ['gpt-terra'],
      maxOutputCostPerMillion: BALANCED_CEILING_PER_MILLION,
      requires: BYOK_REQUIRES,
    },
    {
      author: GOOGLE,
      families: ['gemini-flash'],
      maxOutputCostPerMillion: BALANCED_CEILING_PER_MILLION,
      requires: BYOK_REQUIRES,
    },
  ],
  powerful: [
    {
      author: ANTHROPIC,
      families: ['claude-opus'],
      maxOutputCostPerMillion: POWERFUL_CEILING_PER_MILLION,
      requires: BYOK_REQUIRES,
    },
    {
      author: OPENAI,
      families: ['gpt-sol'],
      maxOutputCostPerMillion: POWERFUL_CEILING_PER_MILLION,
      requires: BYOK_REQUIRES,
    },
    {
      author: GOOGLE,
      families: ['gemini-pro'],
      maxOutputCostPerMillion: POWERFUL_CEILING_PER_MILLION,
      requires: BYOK_REQUIRES,
      allowPreview: true,
    },
  ],
};

function slugOf(row: IndexedModel): string {
  return row.id.slice(row.id.indexOf(VARIANT_SEPARATOR) + 1);
}

function isOutsideRetirementWindow(row: IndexedModel, now: Date): boolean {
  if (row.retiresAt === null) {
    return true;
  }
  const retiresAt = Date.parse(`${row.retiresAt}${START_OF_DAY_UTC}`);
  return retiresAt - now.getTime() > RETIREMENT_WINDOW_DAYS * MS_PER_DAY;
}

function isTextModel(row: IndexedModel): boolean {
  return (
    row.outputModalities.length === 1 &&
    row.outputModalities[0] === TEXT_MODALITY &&
    row.inputModalities.includes(TEXT_MODALITY)
  );
}

function isConcreteId(slug: string, allowPreview: boolean): boolean {
  return (
    !slug.startsWith(ALIAS_PREFIX) &&
    !slug.includes(VARIANT_SEPARATOR) &&
    !EXCLUDED_ID_TOKENS.some((token) => slug.includes(token)) &&
    (allowPreview || !slug.includes(PREVIEW_TOKEN))
  );
}

function isPriced(row: IndexedModel): boolean {
  return (row.inputCostPerToken ?? 0) > 0 && (row.outputCostPerToken ?? 0) > 0;
}

function isWithinCeiling(
  row: IndexedModel,
  ceilingPerMillion: number | undefined
): boolean {
  if (ceilingPerMillion === undefined) {
    return true;
  }
  return (
    row.outputCostPerToken !== null &&
    row.outputCostPerToken <= ceilingPerMillion / TOKENS_PER_MILLION
  );
}

/** Whether auto-selection may pick the row under `rule` at `now`; an unknown capability, or an unknown or zero input or output price, never qualifies. */
export function isEligible(
  row: IndexedModel,
  rule: EligibilityRule,
  now: Date
): boolean {
  return (
    !EXCLUDED_STATUSES.includes(row.status) &&
    isOutsideRetirementWindow(row, now) &&
    isTextModel(row) &&
    isConcreteId(slugOf(row), rule.allowPreview === true) &&
    rule.requires.every(
      (capability) => row[CAPABILITY_FLAG[capability]] === true
    ) &&
    isPriced(row) &&
    isWithinCeiling(row, rule.maxOutputCostPerMillion)
  );
}

function servesSelector(
  row: IndexedModel,
  selector: ModelSelector,
  provider: IndexProvider
): boolean {
  if (row.provider !== provider) {
    return false;
  }
  return (
    provider !== OPENROUTER_PROVIDER ||
    slugOf(row).startsWith(`${selector.author}${AUTHOR_SEPARATOR}`)
  );
}

function byResolutionOrder(a: IndexedModel, b: IndexedModel): number {
  if (a.releasedAt !== b.releasedAt) {
    if (a.releasedAt === null) {
      return 1;
    }
    if (b.releasedAt === null) {
      return -1;
    }
    return a.releasedAt < b.releasedAt ? 1 : -1;
  }
  if (a.id.length !== b.id.length) {
    return a.id.length - b.id.length;
  }
  if (a.id === b.id) {
    return 0;
  }
  return a.id < b.id ? -1 : 1;
}

/** The newest eligible row of the selector's families on `provider`, or null when `provider` is neither the selector's author nor openrouter. Ties go to the shortest id, then id order, so an alias beats its dated snapshot. */
export function resolveSelector(
  selector: ModelSelector,
  provider: IndexProvider,
  rows: readonly IndexedModel[],
  now: Date = new Date()
): IndexedModel | null {
  if (provider !== OPENROUTER_PROVIDER && provider !== selector.author) {
    return null;
  }
  const candidates = rows.filter(
    (row) =>
      servesSelector(row, selector, provider) &&
      row.family !== null &&
      selector.families.includes(row.family) &&
      isEligible(row, selector, now)
  );
  return candidates.toSorted(byResolutionOrder)[0] ?? null;
}

/** The first BYOK selector of `intent`, in table order, that resolves on `provider`: what a holder of only this key runs. */
export function resolveByokIntent(
  intent: ModelIntent,
  provider: ByokProvider,
  rows: readonly IndexedModel[],
  now: Date = new Date()
): IndexedModel | null {
  for (const selector of BYOK_SELECTORS[intent]) {
    const resolved = resolveSelector(selector, provider, rows, now);
    if (resolved !== null) {
      return resolved;
    }
  }
  return null;
}

/** The intent whose BYOK selector lists this family, or null. */
export function intentOfFamily(family: string | null): ModelIntent | null {
  if (family === null) {
    return null;
  }
  return (
    MODEL_INTENTS.find((intent) =>
      BYOK_SELECTORS[intent].some((selector) =>
        selector.families.includes(family)
      )
    ) ?? null
  );
}
