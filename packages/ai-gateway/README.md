# @knowtis/ai-gateway

Framework-free core for multi-provider LLM access: model catalog + pricing, provider fallback chains, prompt-injection defense, token/cost estimation, and web search. Consumed by the API's `ai` and `agent` modules behind NestJS ports.

## Golden rule: zero workspace dependencies

This package imports **no other `@knowtis/*` package** and **no framework** (no NestJS, no Express). It depends only on the Vercel AI SDK + provider SDKs. That keeps it pure and **extractable** — it could be published standalone. The NestJS wiring (DI, config, feature flags, persistence) lives in `apps/api`; this package stays framework-light. Do not add workspace or framework imports here.

## Features

- **Model catalog** — curated model metadata, context windows, and pricing, with a vendored LiteLLM price snapshot for cost computation.
- **Provider fallback chain** — `execute`/`stream` across an ordered candidate list with a cooldown tracker that skips recently-failed providers.
- **Prompt-injection guard** — `detectPromptInjection` (OWASP LLM01 patterns) + `sanitizeContent` for untrusted input.
- **Token & cost** — `estimateTokenCount` and `computeTokenCostUsd`.
- **Web search** — agnostic `WebSearchProvider` port + a framework-free Tavily implementation, with allowlist filtering of attacker-controlled URLs.

## Module map

| Folder        | Responsibility                                                                                                                                                                                                                       |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `catalog/`    | `model-catalog` (curated metadata), `litellm-catalog` + `model-prices.snapshot` (pricing), `compute-token-cost`                                                                                                                      |
| `chain/`      | `model-chain` (`executeWithChain` / `streamWithChain`, candidate resolution, `cooldownKeyOf`, error classifiers), `provider-cooldown.tracker`                                                                                        |
| `guard/`      | `prompt-guard` (`detectPromptInjection`), `input-sanitizer` (`sanitizeContent`), `injection-corpus` (`ATTACK_CORPUS` / `BENIGN_CORPUS`, the package-local regression corpus the guard is tested against; not part of the public API) |
| `tokens/`     | `token-estimator` (`estimateTokenCount`)                                                                                                                                                                                             |
| `web-search/` | `web-search.types` (port), `tavily-web-search` (impl), `filter-external-content` (URL allowlist), `extract-urls` (`extractHttpUrls`)                                                                                                 |

## Public API

Everything is exported from [`src/index.ts`](src/index.ts):

- **Catalog:** `MODEL_CATALOG`, `LiteLLMCatalog`, `toLiteLLMKey`, `computeTokenCostUsd`, `MODEL_PRICES_SNAPSHOT` (+ `ModelCatalog`, `ModelPricing`, `ModelContextWindow`, `TokenCostInput` types).
- **Chain:** `executeWithChain`, `streamWithChain`, `resolveChainCandidates`, `providerOf`, `cooldownKeyOf`, `OPENROUTER_PROVIDER`, `isAbortError`, `isOverloadedError`, `ProviderCooldownTracker` (+ `ChainScope`, `ChainContext`, `StreamChainContext`, `ChainAttemptInfo`, `ChainResolutionInput`, `CooldownConfig`, `ProviderCooldown`, `ProviderHealthSnapshot` types).
- **Guard:** `detectPromptInjection`, `sanitizeContent`.
- **Tokens:** `estimateTokenCount`.
- **Web search:** `TavilyWebSearch`, `filterExternalHits`, `isHttpUrl`, `extractHttpUrls`, `WebSearchProvider` port (+ `WebSearchHit`, `WebSearchResult`, `WebFetchResult`, `WebSearchOptions`, `TavilyConfig`, `SafeExternalSource` types).

## Ports & adapters

The package exposes framework-free **interfaces** that `apps/api` adapts into NestJS providers:

- `WebSearchProvider` (port) ← `TavilyWebSearch` (core impl) ← `apps/api/src/modules/ai/infrastructure/web-search/tavily-web-search.adapter.ts` (NestJS adapter, injects config/feature flags).
- `MODEL_CATALOG` / `LiteLLMCatalog` ← `apps/api/src/modules/ai/infrastructure/catalog/model-catalog.adapter.ts`.

Consumed across `apps/api`'s `ai`, `agent`, and `artifacts` modules. The fallback chain and cooldown power the AI module's multi-provider failover; see [docs/AI.md](../../docs/AI.md).

## Testing

Source-only Nx library (no build target).

```bash
nx test ai-gateway
nx lint ai-gateway
```
