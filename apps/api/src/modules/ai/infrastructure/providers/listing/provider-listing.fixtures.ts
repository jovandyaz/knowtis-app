/**
 * Provider model listings and key refusals. Recorded 2026-10-05 with the keys
 * in apps/api/.env and cut; no key, account or usage values. The refusal
 * bodies were recorded with a deliberately bogus key.
 */

const OPENAI_SYSTEM_OWNER = 'system';
const SCRUBBED_ACCOUNT_VALUE = 'recorded';

/** `GET /v1/models?limit=…` first page: more follow after `last_id`. */
export const ANTHROPIC_MODELS_PAGE_1 = {
  data: [
    {
      id: 'claude-sonnet-5-5',
      display_name: 'Claude Sonnet 5.5',
      created_at: '2026-09-28T00:00:00Z',
    },
    {
      id: 'claude-opus-5-5',
      display_name: 'Claude Opus 5.5',
      created_at: '2026-09-21T16:24:00Z',
    },
    {
      id: 'claude-fable-5-1',
      display_name: 'Claude Fable 5.1',
      created_at: '2026-08-28T00:00:00Z',
    },
  ],
  has_more: true,
  last_id: 'claude-fable-5-1',
} as const;

/** The last page. Anthropic lists Haiku 4.5 only as its dated snapshot. */
export const ANTHROPIC_MODELS_PAGE_2 = {
  data: [
    {
      id: 'claude-sonnet-4-6',
      display_name: 'Claude Sonnet 4.6',
      created_at: '2026-02-17T00:00:00Z',
    },
    {
      id: 'claude-haiku-4-5-20251001',
      display_name: 'Claude Haiku 4.5',
      created_at: '2025-10-15T00:00:00Z',
    },
  ],
  has_more: false,
  last_id: 'claude-haiku-4-5-20251001',
} as const;

/** HTTP 401. */
export const ANTHROPIC_INVALID_KEY_BODY = {
  error: { type: 'authentication_error', message: 'API key is invalid.' },
} as const;

/**
 * `GET /v1/models`: shape from the provider docs, not recorded
 * (https://developers.openai.com/api/reference/resources/models/methods/list),
 * because the local key was refused. One page, no pagination.
 */
export const OPENAI_MODELS = {
  data: [
    { id: 'gpt-5.5', owned_by: OPENAI_SYSTEM_OWNER },
    { id: 'gpt-5-mini', owned_by: OPENAI_SYSTEM_OWNER },
    { id: 'gpt-4.1', owned_by: OPENAI_SYSTEM_OWNER },
    { id: 'gpt-4o', owned_by: OPENAI_SYSTEM_OWNER },
    { id: 'gpt-4o-2024-08-06', owned_by: OPENAI_SYSTEM_OWNER },
    { id: 'o3', owned_by: 'openai' },
  ],
} as const;

/** HTTP 401. The masked key OpenAI echoes is replaced with `[redacted]`. */
export const OPENAI_INVALID_KEY_BODY = {
  error: {
    message:
      'Incorrect API key provided: [redacted]. You can find your API key at https://platform.openai.com/account/api-keys.',
    type: 'invalid_request_error',
    code: 'invalid_api_key',
  },
} as const;

/** `GET /v1beta/models?pageSize=…` first page, with its real `nextPageToken`. */
export const GOOGLE_MODELS_PAGE_1 = {
  models: [
    { name: 'models/gemini-2.5-flash', displayName: 'Gemini 2.5 Flash' },
    { name: 'models/gemini-2.5-pro', displayName: 'Gemini 2.5 Pro' },
    {
      name: 'models/gemini-2.5-flash-preview-tts',
      displayName: 'Gemini 2.5 Flash Preview TTS',
    },
  ],
  nextPageToken: 'CiNtb2RlbHMvZ2VtaW5pLTIuNS1mbGFzaC1wcmV2aWV3LXR0cw==',
} as const;

/** The last page. */
export const GOOGLE_MODELS_PAGE_2 = {
  models: [
    {
      name: 'models/gemini-2.5-pro-preview-tts',
      displayName: 'Gemini 2.5 Pro Preview TTS',
    },
    { name: 'models/gemma-4-26b-a4b-it', displayName: 'Gemma 4 26B A4B IT' },
    { name: 'models/gemma-4-31b-it', displayName: 'Gemma 4 31B IT' },
  ],
} as const;

/** HTTP 400: Gemini reports a bad key as an invalid argument. */
export const GOOGLE_INVALID_KEY_BODY = {
  error: {
    message: 'API key not valid. Please pass a valid API key.',
    details: [{ reason: 'API_KEY_INVALID' }],
  },
} as const;

/** `GET /api/v1/key`, HTTP 200. */
export const OPENROUTER_KEY = {
  data: {
    label: SCRUBBED_ACCOUNT_VALUE,
    is_management_key: false,
    is_provisioning_key: false,
  },
} as const;

/** `GET /api/v1/models/user`: the models the account's routing settings allow. */
export const OPENROUTER_USER_MODELS = {
  data: [
    { id: 'anthropic/claude-sonnet-5.5' },
    { id: 'anthropic/claude-haiku-4.5' },
    { id: 'openai/gpt-5-mini' },
    { id: 'google/gemini-3.5-flash' },
    { id: 'moonshotai/kimi-k3' },
    { id: 'qwen/qwen3.8-27b:free' },
  ],
  links: { next: null },
} as const;

/** `GET /api/v1/key`, HTTP 401. */
export const OPENROUTER_INVALID_KEY_BODY = {
  error: { message: 'Missing Authentication header', code: 401 },
} as const;
