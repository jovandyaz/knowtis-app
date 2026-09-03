# @knowtis/ai-gateway

Framework-free core for multi-provider LLM access: pricing catalog, provider fallback chains, prompt-injection defense, token/cost estimation, and web search. Consumed by the API's `ai`, `agent`, `artifacts`, and `organization` modules behind NestJS ports.

## Golden rule: zero workspace dependencies

This package imports **no other `@knowtis/*` package** and **no framework** (no NestJS, no Express). It does not import the Vercel AI SDK or any `@ai-sdk/*` provider either — the only third-party runtime import is `gpt-tokenizer` (`tokens/token-estimator.ts`); the chain helpers take the model call as a function argument. That keeps it pure and **extractable**. The NestJS wiring (DI, config, feature flags, persistence) lives in `apps/api`. Do not add workspace or framework imports here.

## Features

- **Pricing catalog** — `ModelCatalog` interface + `MODEL_CATALOG` DI symbol, `LiteLLMCatalog` over a vendored LiteLLM price snapshot, `computeTokenCostUsd`. The curated model list (labels, tiers, reasoning metadata) is **not** here — it lives in `apps/api/src/modules/ai/domain/model-catalog/selectable-models.catalog.ts`.
- **Provider fallback chain** — `executeWithChain` / `streamWithChain` across an ordered candidate list with a cooldown tracker that skips recently-failed providers.
- **Prompt-injection guard** — `detectPromptInjection` (OWASP LLM01 patterns) + `sanitizeContent` for untrusted input.
- **Token & cost** — `estimateTokenCount` and `computeTokenCostUsd`.
- **Web search** — agnostic `WebSearchProvider` port + a framework-free Tavily implementation, with allowlist filtering of attacker-controlled URLs.

## Module map

| Path          | Responsibility                                                                                                                                                                                                                       |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `catalog/`    | `model-catalog` (`MODEL_CATALOG` symbol + `ModelCatalog`, `ModelPricing`, `ModelContextWindow` interfaces), `litellm-catalog` + `model-prices.snapshot` (pricing), `compute-token-cost`                                              |
| `chain/`      | `model-chain` (`executeWithChain` / `streamWithChain`, candidate resolution, `cooldownKeyOf`, error classifiers), `provider-cooldown.tracker`                                                                                        |
| `guard/`      | `prompt-guard` (`detectPromptInjection`), `input-sanitizer` (`sanitizeContent`), `injection-corpus` (`ATTACK_CORPUS` / `BENIGN_CORPUS`, the package-local regression corpus the guard is tested against; not part of the public API) |
| `tokens/`     | `token-estimator` (`estimateTokenCount`, `gpt-tokenizer`)                                                                                                                                                                            |
| `web-search/` | `web-search.types` (port), `tavily-web-search` (impl), `filter-external-content` (URL allowlist), `extract-urls` (`extractHttpUrls`)                                                                                                 |
| `logger.ts`   | `GatewayLogger` — the `{ warn, error }` interface the chain and cooldown tracker log through; the API passes a NestJS `Logger`-backed adapter                                                                                        |

## Public API

Everything is exported from [`src/index.ts`](src/index.ts):

- **Logger:** `GatewayLogger` type.
- **Catalog:** `MODEL_CATALOG`, `LiteLLMCatalog`, `toLiteLLMKey`, `computeTokenCostUsd`, `MODEL_PRICES_SNAPSHOT` (+ `ModelCatalog`, `ModelPricing`, `ModelContextWindow`, `TokenCostInput` types).
- **Chain:** `executeWithChain`, `streamWithChain`, `resolveChainCandidates`, `providerOf`, `cooldownKeyOf`, `OPENROUTER_PROVIDER`, `isAbortError`, `isOverloadedError`, `ProviderCooldownTracker` (+ `ChainScope`, `ChainContext`, `StreamChainContext`, `ChainAttemptInfo`, `ChainResolutionInput`, `CooldownConfig`, `ProviderCooldown`, `ProviderHealthSnapshot` types).
- **Guard:** `detectPromptInjection`, `sanitizeContent`.
- **Tokens:** `estimateTokenCount`.
- **Web search:** `TavilyWebSearch`, `filterExternalHits`, `isHttpUrl`, `extractHttpUrls`, `WebSearchProvider` port (+ `WebSearchHit`, `WebSearchResult`, `WebFetchResult`, `WebSearchOptions`, `TavilyConfig`, `SafeExternalSource` types).

In `apps/api`, `MODEL_CATALOG` is bound to `CompositeModelCatalog` and `WebSearchProvider` is adapted by `TavilyWebSearchAdapter`; the full binding table is in [docs/AI.md — Ports & Adapters](../../docs/AI.md#ports--adapters).

## Testing

Source-only Nx library (no build target).

```bash
nx test ai-gateway
nx lint ai-gateway
```
