import type { InjectionClassifierService } from '../../ai/application/services/injection-classifier.service';

/** A classifier that judges every text safe, so a test shows a guarantee holding when injection detection fails. */
export const ALWAYS_SAFE_CLASSIFIER: Pick<
  InjectionClassifierService,
  'classify'
> = {
  classify: () => Promise.resolve({ safe: true }),
};

/** Tavily settings with a test key, so the web tools are offered and an egress recorder answers them. */
export const TAVILY_TEST_CONFIG = {
  TAVILY_API_KEY: 'test-tavily-key',
  AI_WEB_SEARCH_MAX_RESULTS: 5,
  AI_WEB_SEARCH_DEPTH: 'basic',
  AI_TIMEOUT_MS: 5_000,
  AI_WEB_SEARCH_PRICE_PER_CREDIT_USD: 0,
} as const;
