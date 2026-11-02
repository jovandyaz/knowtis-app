# AI architecture in one page

Knowtis serves AI through two surfaces on a shared core, and an MCP server lets external AI clients in. The full reference is [AI.md](./AI.md).

| Part               | What it does                                                                 | Code                         |
| ------------------ | ---------------------------------------------------------------------------- | ---------------------------- |
| **Single-shot AI** | Editor actions, ghost text, voice notes                                      | `apps/api/src/modules/ai`    |
| **Copilot**        | Conversational agent with tools, memory and approvals                        | `apps/api/src/modules/agent` |
| **Shared core**    | Fallback chain, cooldowns, injection guard, token costing. Framework-free    | `packages/ai-gateway`        |
| **MCP server**     | Lets external AI clients read and change notes under OAuth or API-key scopes | `apps/mcp`                   |

## One copilot turn

```
client ── one message + conversationId ──▶ /agent socket
                                               │
              rebuild the thread from Postgres, resolve model and payer
                                               │
                        ┌──────────── step loop ◀───────────┐
                        ▼                                   │
                 one streamText call ── tool results ───────┘
                        │        │
           silent or errors,     mutation requested
           nothing streamed      │
                        │        ▼
                        │     proposal parked in Redis ──▶ client approves ──▶ commit, resume
                        ▼
                 next chain candidate
```

## What must always hold

- **The server owns the turn.** The client sends one message and never its history.
- **Humans approve copilot changes.** A mutation is a proposal until `agent:approve`. MCP is a separate surface: it applies changes directly under the [scopes the user granted](./MCP.md#scopes).
- **Retrieved content is delivered as data.** Notes, memories and web results are screened by the [injection guard](./AI.md#prompt-injection-defense). The screen is best-effort, so what must hold is [containment when a model is fooled](./AI.md#guarantees-under-a-compromised-model).
- **Bring-your-own-key (BYOK) fails closed.** A failing user key never falls back to a platform model.
- **A stream never switches model once answer text has streamed.** Before that, the first step of a turn can fail over even after showing thinking, and a continuation can fail over only if it streamed nothing or leaked raw tool markup.

## Which model runs

On platform-billed tiers, each intent (`fast`, `balanced`, `powerful`) serves its supported admin pin, otherwise its active resolution in `ai_model_resolutions`. A daily sync proposes candidates, and the [model gate](./AI.md#model-gate) decides whether a candidate goes live by running the security evals against it. Admin pins skip the gate.

A fresh copilot turn uses the model in the request, then the user's preferred model if they hold a key for its provider, then the user's intent. Resumes and continuations keep the earlier model while it stays valid.

## How it is checked

| Check                                                            | When                                                  | Decides                                                                                                                                                        |
| ---------------------------------------------------------------- | ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit and integration tests, including a scripted hostile model   | Every PR, for affected projects                       | Whether the PR is ready to merge                                                                                                                               |
| PR Evals (`pr-eval.yml`), one trial of the injection guard suite | PRs from this repo touching the agent or `ai-gateway` | Nothing yet: informational                                                                                                                                     |
| Model Gate (`model-gate.yml`)                                    | Daily                                                 | Whether a pending model activates. A decided failure is not retried while the selector keeps resolving to that model; an inconclusive run retries the next day |
| Weekly Evals (`nightly-eval.yml`)                                | Mondays                                               | Nothing in production. A leg goes red on a failed security verdict, a failed run or significant drift, and sends no alert                                      |

Traces go to Langfuse through OpenTelemetry, with content redacted in production and on BYOK turns: see [Telemetry](./AI.md#telemetry-langfuse).

## Where to read next

- [Why the routing layer is in-process](./adr/0001-own-the-ai-routing-layer.md)
- [Fallback chain](./AI.md#cross-provider-fallback-chain) and [copilot model selection](./AI.md#copilot-model-selection)
- [Eval harness](./AI.md#copilot-eval-harness) and [long-term memory](./AI.md#long-term-user-memory-a6b)
- [BYOK](./AI.md#bring-your-own-key-byok)
- [Agent module README](../apps/api/src/modules/agent/README.md) and [`ai-gateway` README](../packages/ai-gateway/README.md)
