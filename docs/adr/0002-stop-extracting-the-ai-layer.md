# ADR 0002: Stop extracting the AI layer at the router

- **Status:** Accepted
- **Date:** 2026-11-15
- **Scope:** [`@jovandyaz/llm-router`](https://github.com/jovandyaz/llm-router) and what stays in `apps/api/src/modules/{ai,agent}`. Builds on [ADR 0001](./0001-own-the-ai-routing-layer.md).

## Context

The AI layer was split to show a reusable router. The work landed in November 2026:

- [#718](https://github.com/jovandyaz/knowtis-app/pull/718) moved web search into the API and added a lint rule that keeps the package free of `ai`, `@ai-sdk/*` and `@nestjs/*`.
- [#719](https://github.com/jovandyaz/knowtis-app/pull/719) freed the step loop from Nest.
- [#720](https://github.com/jovandyaz/knowtis-app/pull/720) and [#721](https://github.com/jovandyaz/knowtis-app/pull/721) moved the package to the `@jovandyaz` scope and renamed it `llm-router`.
- [#723](https://github.com/jovandyaz/knowtis-app/pull/723) replaced the in-repo copy with the published npm package (`^0.1.2`), built from its own repository with changesets and trusted publishing.
- [#729](https://github.com/jovandyaz/knowtis-app/pull/729) upgraded to `0.2.0`: ESM only, with `/chain`, `/catalog`, `/guard` and `/tokens` subpath exports, and the model index published as `data/model-index.json` with a JSON Schema.

The router was published before a second product consumed it, which is the condition ADR 0001 set for extracting it. The step loop is still not extractable: it imports `ProviderRegistryFactory`, BYOK errors and domain types from `modules/ai`.

Plain fallback between models is no longer unique. [`ai-retry`](https://github.com/zirkelc/ai-retry) (2.8.0, peer `ai ^7`) wraps models for the AI SDK and fails over before the first content chunk.

## Decision

Keep the router as the only extracted package and stop there:

- `@jovandyaz/llm-router` keeps the fallback chain, cooldowns, the model catalog, token estimates and the injection guard, with no framework dependency and no AI SDK adapter.
- The step loop, per-segment USD caps, BYOK, `AIRateLimitService`, proposals with human approval, memory, retrieval and evals stay in the app.
- None of this TypeScript logic is ported to the Python agent-toolkit; it stays in Knowtis.
- The package gets maintenance only: the weekly catalog refresh, released as a patch so `^0.2.x` consumers receive it, a `SECURITY.md`, Node 24 in CI and usage examples in the README.

## Options considered

| Option                                                                     | Assessment                                                                                                                       |
| -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| **Stop at the router (chosen)**                                            | The published package stays current at low cost; nothing else is extracted without a consumer.                                   |
| Add an `/ai-sdk` adapter and more packages (`ai-budgets`, `agent-runtime`) | Each package needs a consumer and maintenance. The loop must first be decoupled from `modules/ai`.                               |
| ESM-only build, subpath exports and a catalog published as data            | Shipped in `0.2.0`: importing the chain no longer loads the tokenizer or the snapshot, and the index is fetched only on request. |
| Fold the package back into the monorepo                                    | The publishing setup already works; reverting it costs more than keeping it.                                                     |

## Consequences

- **Gained:** a small, published package that Knowtis consumes from npm, and a clear line between what is reusable and what is product.
- **Cost:** two repositories to keep in step, and every router change ships as a release before Knowtis can use it.
- **Limits:** what sets this layer apart (failover that keeps turn state, per-segment caps, fail-closed BYOK) stays in Knowtis and is not reusable as is.

## Revisit when

- A second product imports `@jovandyaz/llm-router`. Integrate it first, then decide on an adapter or more packages with that consumer's needs.
- The catalog has a consumer outside TypeScript. It reads the published `data/model-index.json` and its schema; nothing is ported.
