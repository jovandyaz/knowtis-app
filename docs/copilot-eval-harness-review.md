# Copilot Eval Harness Review — Audit vs Industria

> Fecha: 2026-08-31
> Alcance: el eval harness del copilot (`apps/api/src/modules/agent/eval/`) evaluado como _sistema de evaluación_ contra las prácticas de industria 2025–2026. Complementa `docs/agent-harness-review.md` (que audita el harness de runtime); no lo repite.
> Método: exploración exhaustiva del código actual (el spec `docs/superpowers/specs/2026-06-13-copilot-eval-harness-design.md` está desactualizado) + contraste con fuentes primarias (ver Fuentes).

## Estado real (vs spec de junio)

| Aspecto             | Spec 2026-06-13           | Hoy                                                                                                                                                   |
| ------------------- | ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Suites              | 1 (`copilot`)             | **6**: copilot (8 casos), injection-guard (1), transcript-replay (1), memory-recall (1), retrieval-quality (2), web-search-quality (1) — **14 casos** |
| Fixture sets        | 4                         | 7 (+`injection-es`, `benign-es`, `exfiltration`)                                                                                                      |
| CI                  | excluido                  | Nightly cron 08:00 UTC (`.github/workflows/nightly-eval.yml`) con pgvector, migraciones y fail-fast si falta `ANTHROPIC_API_KEY`                      |
| Transcript          | 5 campos                  | +`stopReason`, +`servedModel`, +`steps` (habilita replay multi-turno)                                                                                 |
| Guard de modelo     | no existía                | `pinned-model.ts`: pre-flight de chain + post-flight `servedModel` (#373/#381)                                                                        |
| Grader              | default                   | Explícito: `anthropic:messages:claude-haiku-4-5`                                                                                                      |
| Dependencias reales | Anthropic + PG/Redis boot | +Voyage real (2 suites), +Tavily real (1 suite), seeds en PG real con cleanup                                                                         |

Detalles de arquitectura: 2 suites usan promptfoo como librería (`runEvalSuite` en `runtime/eval-runtime.ts`: copilot, injection-guard), 4 son Vitest puro. `maxConcurrency: 1` hardcoded. Al momento del audit: sin repeat, sin thresholds, sin output persistido (ver Estado al final — G1/G6/G8 cerrados después). 72 unit tests cubren el harness mismo.

## Fortalezas (por encima de la media)

1. **Capa determinista primero, rubric después** (`assertions.ts`) — consenso exacto: "code-based > model-based".
2. **Guard de `servedModel` pinneado** (`eval/pinned-model.ts`) — evita calificar al modelo equivocado tras fallback; nacido de bug real (#373).
3. **Caso anti-falso-positivo** (`benign-es` guard-bait) — evaluar over-blocking es raro en la industria.
4. **`assertNoExfiltrationLink`** con decodificación de entidades HTML y comparación por hostname parseado.
5. **Fidelidad de integración**: bootea el DI graph de producción con override mínimo (`RETRIEVAL_PORT`, `PENDING_MUTATION_STORE`) — drift eval↔prod casi nulo.
6. **Nightly con fail-fast** si falta la key — sin "verde por skip silencioso".

## Gaps priorizados

### Tier 1 — divergencias de consenso con impacto directo

**G1. Single-trial con exigencia de 100%.** Cada caso corre 1 vez con la temperatura de producción (0.7 fija, `step-call.ts:43`) y se exige `failures === 0`. Consenso unánime (Anthropic; promptfoo `repeat` + pass-rate threshold): comportamiento agéntico estocástico nunca se evalúa con un solo trial. Un rojo no distingue regresión de varianza (→ se ignora); un verde puede ocultar regresión que pasó por suerte. Con 14 casos, 3× los casos rubric cuesta centavos. **La mejora más barata con mayor retorno.** — **Resuelto (#393, refinado por #401)**: ver Estado.

**G2. Cero gate en PRs.** La regla del repo ("toda modificación de prompt/tools lleva eval antes de merge") no tiene enforcement: los evals corren nightly, post-merge. Consenso: **CI dual** — subset determinista barato en PRs paths-filtered (`agent-system-prompt.ts`, `tools/`, `orchestrator/`) + suite completa nightly. Los casos con assertions puramente `javascript` + modelo barato (`AI_EVAL_MODEL`) darían un smoke gate de <2 min.

**G3. Sin flywheel producción→dataset.** La materia prima existe y nada la consume:

- `conversation_messages` persiste transcripts verbatim (`parts` tool_use/tool_result, `stop_reason`, `turn_id`, desde #377)
- Logs de guardrails (`ai.request.injection_blocked` con score, `agent.retrieval.content_blocked`, `agent.history.message_dropped`) — cada bloqueo real es un caso candidato (ataque o falso positivo)
- `agent.turn.health` (outcome/toolErrors/stopReason por llamada LLM)

No hay feedback de usuario (thumbs), ni annotation queue, ni conversión de fallas reales a casos. El dataset es 100% sintético/manual. Consenso más fuerte de la industria (Hamel, LangSmith, Anthropic: _"convert user-reported failures into test cases"_; empezar con 20–50 tareas de fallas reales). `transcript-replay.fixtures.ts` ya demuestra el patrón técnico.

**G4. Cobertura conductual con huecos caros.** 14 casos para ~14 comportamientos prompt-driven identificados; lo grave es _qué_ falta:

| Superficie sin eval                                                                                                                                                     | Gravedad |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| **Fase resume completa** (segunda mitad del HITL): pending store no-op ⇒ approve/reject → `resumeTurn`, `RESUME_SYSTEM_NOTE`, drop de proposals en resume — 0 cobertura | Alta     |
| `proposeCreateNote` / `proposeShareNote` (solo update tiene caso) + paths de error (baseVersion stale, email no verificado, sanitizeRejected)                           | Alta     |
| Inyección vía título de nota, snippet web, o **memoria almacenada** (envenenamiento persistente, OWASP ASI06); hoy solo cuerpo-de-nota EN/ES                            | Alta     |
| Atajos current-note / known-notes (mecanismo anti-re-search del prompt compuesto)                                                                                       | Media    |
| `webFetch`: allowlist de egress, drop por guard — el eval web solo cubre `webSearch` con "hay ≥1 source"                                                                | Media    |
| Módulo `ai` single-shot: 17 acciones (artifacts, ghost-text, voice) sin evals de calidad — solo unit tests con mocks                                                    | Media    |
| Idioma de respuesta, "never claim delete", semántica de sharing fields                                                                                                  | Baja     |

### Tier 2 — deuda metodológica

**G5. LLM-as-judge sin calibrar.** `llm-rubric` con haiku, nunca alineado contra etiquetas humanas. Práctica establecida (Hamel): juicios binarios + crítica, calibrados contra ~30 ejemplos etiquetados por el experto, midiendo precision/recall (no acuerdo bruto). Hoy nadie sabe si el grader aprueba respuestas que el equipo reprobaría. Versión ligera: etiquetar transcripts de 2-3 nightly runs y medir acuerdo. — **Resuelto solo como tooling (#394)**: `api:eval-judgments` + `api:eval-agreement` miden precision/recall contra etiquetas commiteadas, ninguno gatea CI; el paso humano de etiquetar sigue abierto.

**G6. Sin baselines ni tracking histórico.** Único registro: log de GitHub Actions. Sin output JSON, sin artefactos, sin comparación entre runs — imposible distinguir regresión gradual de estado histórico, e imposible hacer hill-climbing (capability evals vs regression evals, distinción de Anthropic). Promptfoo emite JSON/JUnit nativamente. — **Resuelto (#393)**: `AI_EVAL_OUTPUT_DIR`, artifact `eval-results` a 90 días y tabla de drift vs el último nightly exitoso; la cobertura sigue limitada a las suites promptfoo (G7).

**G7. Arquitectura fragmentada.** 2 suites promptfoo + 4 Vitest puro = dos modelos de assertion/reporting; los resultados vitest-puros no entran al JSON de promptfoo (limita la cobertura del drift de G6 a los casos promptfoo). La extracción del runtime a `packages/eval-runtime` tenía trigger "2ª suite" — hay 6 y sigue interna; `docs/AI.md` ya describe `runtime/eval-runtime.ts` como el runtime compartido en lugar de un "extraction target" pendiente.

**G8. Sin evals online / verificación asíncrona.** Consenso baseline: offline + scoring asíncrono sobre traces (groundedness, URLs citadas ⊆ `webSources`). Tensión real: Langfuse redacta contenido por default (decisión de privacidad correcta post-#381), lo que bloquea scoring semántico online. Señales estructurales sin contenido disponibles hoy: alerta de tool error rate (la alerta shippeó como el ítem 7 — ver Estado), drift de distribución de `stopReason` (subida de `max_steps`/`token_budget` = regresión de eficiencia del loop, todavía sin implementar).

### Tier 3 — higiene

- **G9. `passWithNoTests: true`** (`vitest.eval.config.ts:14`): si el glob `src/**/*.eval.ts` se rompe en un refactor, el nightly pasa verde con 0 tests.
- **G10. Red-teaming manual, no generativo.** El corpus del guard (79 entradas) cubre la capa regex; la resistencia E2E conductual son 4 casos manuales. `promptfoo redteam` genera variantes de indirect injection / BOLA / tool misuse — útil como corrida trimestral.
- **G11. `maxConcurrency: 1` hardcoded** — correcto hoy (recording adapter singleton con estado); cuello de botella cuando crezca el dataset.

## Plan recomendado

| #   | Acción                                                                  | Esfuerzo   | Cierra          |
| --- | ----------------------------------------------------------------------- | ---------- | --------------- |
| 1   | Repeat ×3 + threshold de pass rate en casos rubric                      | Bajo       | G1              |
| 2   | Smoke gate en PR paths-filtered (casos js-only, modelo barato)          | Medio      | G2              |
| 3   | Casos nuevos: fase resume + create/share proposals + memoria envenenada | Medio      | G4 (lo grave)   |
| 4   | Output JSON + artifact + comparación vs run anterior                    | Bajo       | G6, habilita G3 |
| 5   | Pipeline transcripts/guardrail-logs → casos candidatos (flywheel v0)    | Medio-alto | G3              |
| 6   | Calibración ligera del judge (etiquetar ~30, medir acuerdo)             | Bajo       | G5              |
| 7   | Alerta tool error rate + drift de stopReason (online estructural)       | Bajo       | G8              |

Quick wins: 1, 4, 6, 7. Trabajo real: 2, 3, 5.

**Observación**: `docs/agent-harness-review.md` ya identificaba G1/G2 (prioridad 6) y G3 (prioridad 9) desde agosto; se ejecutó primero el harness de runtime (Bolt 1/2, SDK v7). Con el runtime sólido, el eval harness es hoy el eslabón más débil del sistema.

## Estado (2026-09-03; la rama `feat/eval-harness-quick-wins` mergeó como #393/#394)

Ítems 1, 4 y 7 entregados; semántica as-built donde difiere de lo propuesto arriba:

- **Ítem 1 (G1, #393)**: `AI_EVAL_TRIALS` aplica a _todos_ los casos promptfoo (superset de "casos rubric"); umbral `ceil(2/3 × trials)` por caso. Los asserts `errors === 0` se retiraron a propósito: un error de proveedor en un trial se absorbe por el umbral (tolerancia a flakes), mientras un error sistemático (p. ej. key sin créditos) falla 0/N y sigue poniendo el nightly en rojo.
- **Denominador del umbral (#401)**: un trial cuyos fallos son todos error de transporte del grader (`metadata.graderError`) no lleva veredicto y **sale del denominador** en vez de contar como regresión. Dos guardas evitan que eso convierta rojo en verde: un caso con _todos_ sus trials no calificados falla, y un trial mixto — fallo conductual **más** error de grader — sigue siendo fallo, igual que un throw del provider (que es como truena `assertPinnedModelServed`).
- **Modelo del eval**: fijado a `anthropic:claude-sonnet-5` en las cuatro suites que corren un turno del agente (`eval/copilot.eval.ts:20`, injection-guard, transcript-replay, web-search-quality), sobreescribible con `AI_EVAL_MODEL`; el guard `assertPinnedModelServed` (#387) truena si el modelo servido difiere.
- **Ítem 4 (G6)**: `AI_EVAL_OUTPUT_DIR` persiste JSON nativo de promptfoo + `<suite>.summary.json` por suite promptfoo y `vitest.json` para el resto; artifact `eval-results` (90 días) y tabla de drift vs el último nightly exitoso (rehúsa comparar si cambia modelo o trials). La tabla cubre solo las suites promptfoo; la cobertura completa llega con G7.
- **Ítem 7 (G8)**: v0 con umbrales fijos (`AGENT_TOOL_ERROR_ALERT_RATE`, `AGENT_STOP_ANOMALY_ALERT_RATE`, n ≥ 20) sobre `conversation_messages` persistido (parts `outputType` de error y `stop_reason`), no sobre el log `agent.turn.health`; drift estadístico con baseline móvil queda como follow-up si el umbral fijo resulta ruidoso.

Follow-ups anotados en el review de la rama: dedup del bloque compartido de los dos `*.eval.ts` promptfoo (junto con G7) y retiro del knob `minPassRate` sin caller de producción. QW6 (ítem 6, calibración del judge) ya está entregado: `api:eval-judgments` extrae la worksheet de juicios `llm-rubric` del JSON nativo y `api:eval-agreement` reporta matriz de confusión, precision y recall sobre las etiquetas commiteadas en `calibration/labels/` — ambos son solo medición, ninguno gatea CI. G5 queda abierto únicamente por el paso humano: etiquetar ~30 filas sobre transcripts de nightlies.

## Fuentes

- Promptfoo: [assertions/expected-outputs](https://www.promptfoo.dev/docs/configuration/expected-outputs/) (deterministas, model-graded, `trajectory:*`), [CI/CD](https://www.promptfoo.dev/docs/integrations/ci-cd/), [caching](https://www.promptfoo.dev/docs/configuration/caching/), [CLI/repeat/outputs](https://www.promptfoo.dev/docs/usage/command-line/), [red-team](https://www.promptfoo.dev/docs/red-team/)
- Hamel Husain: [Your AI Product Needs Evals](https://hamel.dev/blog/posts/evals/) (niveles 1-3, error analysis, pass rate como decisión de producto), [Creating a LLM-as-a-Judge](https://hamel.dev/blog/posts/llm-judge/) (binario + crítica, calibración con experto, precision/recall)
- Anthropic: [develop tests](https://platform.claude.com/docs/en/test-and-evaluate/develop-tests) (critique-then-decide, volumen sobre calidad), Demystifying evals / Outcome grader cookbook (grader en contexto fresco; capability vs regression evals)
- LangSmith: [evaluation concepts](https://docs.langchain.com/langsmith/evaluation-concepts) (offline vs online, splits regresión/exploración, annotation queues, flywheel)
- OWASP: [Agentic Top 10 2026](https://genai.owasp.org/2025/12/09/owasp-top-10-for-agentic-applications-the-benchmark-for-agentic-security-in-the-age-of-autonomous-ai/) (ASI06 Memory & Context Poisoning)
