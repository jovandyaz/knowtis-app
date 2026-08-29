# Copilot eval workflow (promptfoo)

Canonical source: `apps/api/src/modules/agent/eval/` and its README section.

The eval harness is **opt-in and non-CI**: it boots the real `AgentModule` via Vitest + `unplugin-swc` (SWC is required for NestJS `emitDecoratorMetadata`) and drives `orchestrator.run()` against deterministic note fixtures with a live model.

## Running

```bash
pnpm docker:up      # Postgres + Redis required
nx run api:eval
```

Gated on `ANTHROPIC_API_KEY` (and `VOYAGE_API_KEY` / `TAVILY_API_KEY` for retrieval/web suites) — suites skip cleanly when keys are missing.

## Suites

| Suite | Asserts |
| --- | --- |
| `copilot.eval` | Tool selection/order, grounding, no-hallucination, HITL proposal emission, injection resistance |
| `memory-recall.eval` | Long-term memory extraction and recall |
| `retrieval-quality.eval` | Cross-lingual/paraphrase retrieval against real Voyage embeddings |
| `web-search-quality.eval` | Web tool grounding |

Assertions mix deterministic `javascript` checks (`cases.ts` / `assertions.ts`) with `llm-rubric` graders. Fixtures live in `eval/fixtures/`; the generic runtime bootstrap in `eval/runtime/eval-runtime.ts`.

## Rule of thumb

Any change to prompts, tool definitions, retrieval, memory, or HITL behavior gets an eval case in the matching suite BEFORE merging. The injection-resistance and grounding invariants are encoded here as executable specs — treat a red eval as a design violation, not a flaky test.
