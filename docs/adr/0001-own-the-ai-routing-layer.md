# ADR 0001: Own the AI routing layer in-process

- **Status:** Accepted
- **Date:** 2026-11-01. Retroactive: it records a decision taken in stages, whose main technical step was [#157](https://github.com/jovandyaz/knowtis-app/pull/157).
- **Scope:** the fallback chain, per-step failover and budgets in `packages/ai-gateway` and `apps/api/src/modules/{ai,agent}`.

No comparison of alternatives was written down when the decision was made. The options below are assessed with what is known on the date of this record, not what was known then.

## Context

A copilot turn is several model calls: each step can call tools, and their results feed the next step. A turn can also pause on a proposal until the user approves it. Turns must keep working when a model goes silent, and every call must be attributed to the right payer, the platform or the user's own key.

A gateway that works per HTTP request sees one call at a time. It cannot tell whether a step already showed output to the user, which tool results must be replayed, how much of the turn's budget is left, or whether the turn is on a user's key.

## Decision

Keep routing in-process, built on the Vercel AI SDK:

- `@jovandyaz/ai-gateway` owns the fallback chain and provider cooldowns.
- The agent module owns the step loop: one `streamText` call per step, each with its own time-to-first-token and silence budgets.
- A failing first step moves to the next candidate through the chain. A continuation step gets a bounded retry on its own model. If it stays silent or errors before streaming anything, it moves on too, replaying the threaded history without re-running tools.

We build the part that needs turn state and buy the rest. The AI SDK abstracts providers. OpenRouter serves the seeded platform models. Vercel AI Gateway is an alternative mode enabled by `AI_GATEWAY_API_KEY`; it cannot route `openrouter:*` ids, so every intent and chain entry must first be pinned to other providers.

## Options considered

| Option                                      | Assessment                                                                                                                                                                                                                                                                                      |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **In-process layer on the AI SDK (chosen)** | Failover and budgets can use turn state, and no extra service joins the request path. We own and maintain the code.                                                                                                                                                                             |
| **LiteLLM**                                 | A Python proxy, so a separate service for this TypeScript backend, working per request. Its PyPI releases 1.82.7 and 1.82.8 were [compromised in March 2026](https://docs.litellm.ai/blog/tags/security), which shows the supply-chain exposure of a dependency holding every provider key.     |
| **Portkey**                                 | A gateway with the same per-request boundary. [Palo Alto Networks announced its acquisition](https://nand-research.com/palo-alto-networks-portkey-acquisition-anchors-its-agentic-security-stack/) in 2026 to fold it into an enterprise security platform, so its roadmap may not follow ours. |
| **OpenRouter alone**                        | It fails over between upstreams of one model, below our layer, and we keep using it for that. It knows nothing about turn state or the payer.                                                                                                                                                   |
| **Vercel AI Gateway alone**                 | Same per-request boundary. Supported as a mode beneath the chain, not instead of it.                                                                                                                                                                                                            |
| **LangChain / LangGraph**                   | Orchestration frameworks, not a routing answer: the failover and budget rules would still be ours, on top of another abstraction over the AI SDK's job.                                                                                                                                         |

## Consequences

- **Gained:** one budget per call, failover between steps, and fail-closed bring-your-own-key (BYOK): a BYOK turn never moves to another key or model.
- **Cost:** we maintain the step loop (over 700 lines), the chain and the cooldowns, and we absorb AI SDK major upgrades.
- **Limits:**
  - A stream never switches model once answer text has streamed, so a failure after that point ends the turn with an error.
  - BYOK turns get no cross-model failover.
  - Owning the chain does not remove the OpenRouter dependency. Every platform selector resolves to OpenRouter, so with default settings an OpenRouter outage takes out every candidate. Pinning an intent or the chain to direct providers avoids that, but pinned models skip the model gate, and calls scoped to one model family still do not cross providers.
- **Dependency risk:** [Stripe agreed to acquire OpenRouter in August 2026](https://thenextweb.com/news/stripe-openrouter-acquisition-confirmed); we have not confirmed that it closed. Pricing or terms may change without any call failing, so the chain would not react. The mitigation is pinning all three intents to direct-provider models.

## Revisit when

- A gateway exposes turn-level failover and budgets, which would remove the reason for owning the loop.
- A second product needs this layer, which would justify extracting it as a library.
- Maintaining the loop costs more than the outages it prevents.
