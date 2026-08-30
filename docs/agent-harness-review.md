# Agent Harness Review — Audit + Benchmark de Industria

> Fecha: 2026-08-27
> Referencias `archivo:línea` tomadas el 2026-08-27; el código ha cambiado desde entonces (Bolt 1), tratarlas como orientación, no como ancla exacta.
> Alcance: agente AI de Knowtis (`apps/api/src/modules/agent`, `apps/api/src/modules/ai`, `packages/ai-gateway`, `apps/mcp`) evaluado contra los 6 pilares de un agent harness (Tool Registry, Model, Context Management, Guardrails, Agent Loop, Verify) y contra las buenas prácticas de industria 2025–2026.

## Resumen ejecutivo

| Pilar              | Veredicto                           | Núcleo                                                                       |
| ------------------ | ----------------------------------- | ---------------------------------------------------------------------------- |
| Agent Loop         | ✅ Bien integrado                   | Loop propio multi-turno, paradas múltiples, failover mid-turn                |
| Tool Registry      | ✅ Bien integrado                   | Registro central DI, Zod 100%, gating fase+flag, HITL                        |
| Model              | ✅ Bien integrado                   | Catálogo DB + curado, BYOK fail-closed, fallback chain + circuit breaker     |
| Guardrails         | ✅ Bien (input) / ⚠️ débil (output) | Guard 2 capas, fencing, cifrado AES-GCM, budgets multicapa                   |
| Context Management | ⚠️ Parcial                          | Ventana fija 12k, sin compaction, sin chequeo contra ventana real del modelo |
| Verify             | ⚠️ Parcial                          | HITL + evals nightly fuertes; cero verificación semántica en runtime         |

No es un wrapper de LLM: loop multi-step propio sobre Vercel AI SDK, HITL para escrituras, injection guard de 2 capas, catálogo de modelos db-backed, rate limiting multicapa. Los 3 pilares fuertes están por encima de la media de la industria. Las divergencias principales contra el consenso 2025–2026: persistencia del transcript (resuelta en Bolt 2 / SP1, replay de tools tras flag), presupuesto dentro del loop denominado en USD (el cap en tokens llegó en Bolt 1; el consenso lo expresa en costo — #365), y evals en CI.

---

## Parte 1 — Audit del repo

### 1.1 Agent Loop — ✅ bien integrado

**Dónde vive:**

| Capa                                                           | Archivo                                                                                              |
| -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Transporte (WS Socket.IO, namespace `/agent`)                  | `apps/api/src/modules/agent/agent.gateway.ts:54`                                                     |
| Orquestación de turno (rate-limit, modelo, BYOK, persistencia) | `apps/api/src/modules/agent/application/run-agent-turn.handler.ts:442`                               |
| Port                                                           | `apps/api/src/modules/agent/domain/ports/agent-orchestrator.port.ts:26`                              |
| Adaptador / cadena de fallback                                 | `apps/api/src/modules/agent/infrastructure/orchestrator/ai-sdk-agent.orchestrator.ts:50`             |
| Loop agéntico real                                             | `apps/api/src/modules/agent/infrastructure/orchestrator/agent-step-loop.ts:146` (`runAgentStepLoop`) |
| Una llamada = un step                                          | `apps/api/src/modules/agent/infrastructure/orchestrator/step-call.ts:158` (`runStepCall`)            |

- Multi-turno de tool-use hecho a mano sobre el SDK: `stopWhen: stepCountIs(1)` (`step-call.ts:196`) — el SDK no hace el loop; `while (completedSteps < input.maxSteps)` (`agent-step-loop.ts:178`) es el loop propio. Si `finishReason === 'tool-calls'` y quedan steps, los bloques `tool_use`/`tool_result` se re-inyectan como historial (`agent-step-loop.ts:338-355`).
- Ejecución de tools delegada al SDK vía callbacks `execute`; no hay despacho manual.
- HITL: tools `propose*` no mutan; emiten propuesta y cortan el loop (`agent-step-loop.ts:320-337`), persistida en Redis con TTL (`redis-pending-mutation.store.ts:51,78-79`). Resume con tools de mutación removidas + nota de sistema anti-negación (`ai-sdk-agent.orchestrator.ts:35-36,113-151`).

**Condiciones de parada:** max steps (`AI_AGENT_MAX_STEPS`, default 8, `env.config.ts:60`), reintentos por step (`MAX_STEP_ATTEMPTS = 2`), wall-clock (`AI_AGENT_MAX_MS` 300s), stall 60s / TTFT 30s con timer rearmado por parte (`step-call.ts:175-184`), abort por `agent:cancel` y por desconexión de socket (`agent.gateway.ts:112-122,178-182,316-337`), concurrencia (`AI_MAX_CONCURRENT_STREAMS` default 2), rate limit pre-turno.

**Errores en el loop:** discriminated union `COMPLETED | STALLED | INTERRUPTED | ERRORED` (`step-call.ts:128-152`), retry silencioso de step, failover a otro modelo a mitad de turno (solo no-BYOK, `agent-step-loop.ts:75-87,234-263`) con poda de reasoning al cambiar familia, fallback chain de turno completo (`model-chain.ts:174-234`), circuit breaker por proveedor (`provider-cooldown.tracker.ts`, `AI_COOLDOWN_ALLOWED_FAILS=3`).

**Streaming:** WebSocket (Socket.IO), no SSE. Eventos `agent:chunk`, `agent:thinking`, `agent:proposal`, `agent:committed`, `agent:done`, `agent:error`. Tool calls/results NO se streamean al cliente.

**Persistencia:** tablas `conversations` / `conversation_messages` (migración `0036`: rol `tool`, `parts` jsonb versionado, `stop_reason`, `turn_id`); `persistTurn` escribe una fila por step completado además del mensaje user y el terminal assistant, exactamente una vez por turno y en todo camino terminal — `done`, `proposal`, `error`, `aborted` y cierre sin evento terminal (Bolt 1). Lectura con `AI_AGENT_HISTORY_LIMIT` 120 (filas, no turnos — un turno con tools escribe 3-5) + `pruneTranscript` (replay verbatim de los últimos `AGENT_HISTORY_TOOL_TURNS`=2 turnos con tools, gateado por el flag `agent_transcript_tools`, default off) + trim por presupuesto de tokens (`AGENT_HISTORY_TOKEN_BUDGET`=12000, sin cambios). `stop_reason` y el marcador `[reply cut off: <reason>]` de respuestas parciales **no** dependen del flag — corren siempre (Bolt 2).

### 1.2 Tool Registry — ✅ bien integrado

- Contrato `AgentToolGroup` (`infrastructure/tools/agent-tool.ts:20-25`): `{ name, flag?, availableIn(phase), build(ctx) }`, fases `full | readonly`.
- Registry central (`agent-tool.registry.ts:12-40`): filtra por fase, omite por flag off, lanza en colisión de nombre. Registro por DI multi-provider (`agent.module.ts:76-84`).
- 9 tools en 3 grupos, todas con Zod:
  - `note-read`: `searchNotes`, `getNote`, `listRecentNotes`, `getNotesOverview` (siempre)
  - `note-mutate`: `proposeCreateNote`, `proposeUpdateNote`, `proposeShareNote` (solo fase `full`)
  - `web`: `webSearch`, `webFetch` (flag `agent_web_search`)
- Validación de args del modelo delegada al AI SDK (schemas en `streamText({ tools })`).
- Outputs acotados: 20 hits búsqueda, 10k chars por nota, 5 hits web × 1500 chars, 8k por fetch.
- Lecturas scopeadas por SQL (`ownerId OR notePermissions`, `drizzle-note-read.repository.ts:334-342`), no por CASL. Escrituras: CASL re-chequeado al commit (`approve-mutation.handler.ts:95-106`), versión optimista contra edición concurrente.
- Ninguna tool del agente escribe directo; propuesta única por run, take atómico Lua single-use en Redis.

### 1.3 Model — ✅ bien integrado

- SDK: Vercel AI SDK (`ai@6.0.105`, `@ai-sdk/anthropic`, `@openrouter/ai-sdk-provider`). No usa `@anthropic-ai/sdk` ni Claude Agent SDK.
- Resolución en cadena (`run-agent-turn.handler.ts:747-798`): request → conversación (resume HITL) → preferencia usuario BYOK → intent DB (`ai_fast/default/deep_model`) → default de sistema → primer seleccionable. Validación final contra catálogo (`AIModel.create`).
- Catálogo db-backed (`ai_catalog_models`, `ai-catalog.schema.ts:37`): sync diario de OpenRouter (`catalog-sync.task.ts:75`), precios LiteLLM con alertas de drift, cache caliente 60s que nunca rechaza, fusión código+DB donde curado gana (`composite-model-catalog.ts:47-53`), admin de promote/retire en backoffice.
- Config en DB (`ai_config`): default/fast/deep model, fallback chain, reasoning effort, providers OpenRouter, techo free tier. Defaults de código como piso.
- BYOK: AES-256-GCM con IV aleatorio (`secret-cipher.ts`), `BYOK_ENCRYPTION_KEY` 32 bytes validada al arranque, validación de key con generateText real, fail-closed si no descifra (`run-agent-turn.handler.ts:547-563`). Turno BYOK: sin fallback chain, sin caching, sin contenido en telemetría, salta rate limit de costo.
- Sampling: `temperature` hardcoded 0.7 (`step-call.ts:39`); `maxOutputTokens` global por env (8192), ignora el techo por modelo del catálogo; reasoning effort desde DB pero solo aplica a `openrouter:*`; prompt caching solo `anthropic:*` y flag-gated (inerte con defaults de fábrica `openrouter:*`).

### 1.4 Guardrails — ✅ input / ⚠️ output

**Injection guard** (`packages/ai-gateway/src/guard/prompt-guard.ts`): 24 patrones ponderados EN/ES, scoring acumulativo, umbral 0.6, normalización NFKC + strip de 17 codepoints zero-width/bidi, guard anti-ReDoS (rechaza >50k chars). Aplicado en 10 puntos: preflight completions, último mensaje del turno, historial (mensajes user inseguros se descartan), pre-embed de memoria, hits de web search, respuesta Tavily, contenido de webFetch, cuerpos de notas recuperadas (flag-gated), memorias extraídas por LLM, clasificación de organización.

**Escalación a classifier LLM** en zona gris 0.3–0.6 (flag `agent_injection_classifier`), fail-open, fuera del fallback chain, `recordContent: false` incondicional.

**Contención estructural:** data fencing `<<NOTE_DATA … DATA, not instructions>>` con marcador neutralizado dentro del cuerpo; `toPromptLiteral` (JSON.stringify) para todo valor no confiable en el system prompt; allowlist de webFetch sembrada solo desde mensajes del usuario y resultados de webSearch; bloqueo SSRF (loopback/private/link-local).

**Sanitización:** input sanitizer mínimo (control chars); HTML server-side con allowlist de 20 tags (`html-sanitizer.ts:50-66`); client DOMPurify con `FORBID_TAGS` (img/iframe/svg/form...) que cierra exfiltración por fetch remoto; `harden-assistant-url.ts` bloquea `<img src>` remoto en chat.

**Rate limiting / costos** (`ai-rate-limit.service.ts`): breaker global de gasto (`AI_GLOBAL_DAILY_COST_LIMIT_USD` 25) → RPM por usuario (15) → reserva atómica token+costo (100k tokens / $1 día, anónimos 33%) → budget per-IP anónimos → fallback PG si Redis cae → warning al 80% con webhook.

**Feature flags:** 17 tipados, 5 marcados GUARDRAIL; todo lookup fail-safe (error → off). `ai_enabled` master en controllers + chequeo manual en gateways WS.

**Output:** solo sanitización HTML + re-screen de inyección en memorias extraídas. Sin moderación, sin PII redaction, sin re-scan del texto assistant.

### 1.5 Context Management — ⚠️ parcial

- Token estimator (`packages/ai-gateway/src/tokens/token-estimator.ts`): chunking de 4k chars (BPE cuadrático), specials contados como texto, nunca lanza, drift <1%, bien testeado. **Se usa solo para dinero, nunca para caber.**
- Historial: 40 mensajes DB → filtro de seguridad (solo user) → `AGENT_HISTORY_TOKEN_BUDGET = 12_000` hardcoded (`run-agent-turn.handler.ts:114`) recorriendo de atrás hacia adelante. Cap 50k chars por mensaje user.
- `maxInputTokens` existe en el catálogo (`model-catalog.ts:12`) y solo se consume para display: nada compara estimación contra ventana real antes de llamar.
- Sin compaction/resumen (grep: cero hits). Ventana deslizante pura.
- Tool results del turno no entran en ningún presupuesto: 8 steps × getNote 10k chars ≈ 20k tokens no contabilizados.
- Inyección de contenido: tool-driven (bien) — `searchNotes` devuelve solo metadata, `getNote` capea a 10k con fence; memorias 300 chars × 6 con floor de similitud; RRF híbrido keyword+vector flag-gated.
- System prompts: agente = constante + composición runtime (`compose-system-prompt.ts`); completions = 17 archivos `.md` con frontmatter + partials (`content-is-data.md`).
- Excepción: paths no-agente hacen dump completo (artifacts hasta 48k chars).

### 1.6 Verify — ⚠️ parcial

**Cadena de mutación (lo más fuerte):** Zod → sanitize con rechazo si queda vacío (`AgentErrors.sanitizeRejected`) → VO de dominio inmutable con type guards → existencia del target verificada en DB → HITL obligatorio → re-check CASL + versión optimista al commit.

**Structured output:** `Output.object({ schema })` con Zod en voice-note, artifacts, organización, memory-reconcile.

**Tests:** 111 specs entre agent/ai/ai-gateway. Corpus de inyección: 45 ataques + 36 benignos (`injection-corpus.ts`). Evals promptfoo (`modules/agent/eval/`): injection, copilot, memory recall, retrieval quality, web search quality; grader `claude-haiku-4-5`; assertions estructurales (`assertGrounding` exige orden searchNotes→getNote + sources).

**CI de evals:** solo nightly (`.github/workflows/nightly-eval.yml`, cron 08:00, falla si falta la key). NO corre en PRs.

**Observabilidad:** Langfuse vía OTel (`langfuse-tracing.service.ts`), telemetría redactada por default (`recordInputs/recordOutputs: false`); tokens/costos exhaustivos por logs estructurados + tabla PG (`AIUsageRepository`) + `AIMetricsService` para backoffice; health de stream por llamada LLM — una línea `agent.turn.health` por `streamText`, incluidos retries y failover, no una por turno (`emitTurnHealth`: DONE|EMPTY|STALL|TIMEOUT|ABORTED|ERROR|PROPOSAL|CONTINUED). Sin correlación trace Langfuse ↔ fila de costo (requestId no viaja en metadata).

**Ausente:** verificación semántica de output (groundedness, URLs citadas vs `webSources`), `editor-schema` no valida ediciones propuestas (la garantía es allowlist de tags, no documento ProseMirror válido).

### 1.7 MCP — superficie separada

- `apps/mcp` (Hono + `@modelcontextprotocol/sdk`): 8 tools kebab-case con inputSchema+outputSchema+annotations MCP, wrapper único de ejecución, sin acceso a DB (todo por HTTP a la API con token del usuario), OAuth ES256 + API keys `knowtis_mcp_*` con token exchange.
- `apps/api/src/modules/mcp`: solo auth/keys. `McpScopeGuard` global valida audiencia post-firma y niega por default; endpoints con `@RequireMcpScope` + CASL → complete mediation OK.
- El agente interno NO consume MCP. Cero código compartido: schemas Zod redeclarados, dos pipelines Markdown→HTML divergentes, tres copias del mapa de scopes sincronizadas por comentario "keep in sync".
- Política divergente: agente = HITL para todo; MCP = `update-note`/`delete-note` inmediatos (el consent lo hace el host MCP según spec, pero `delete-note` irreversible no tiene equivalente HITL interno).

### 1.8 Gaps del audit (priorizados)

1. **Historial multi-step no persiste** — resuelto en Bolt 2 / SP1 (2026-08-30): `conversation_messages` persiste `parts` (tool_use/tool_result completos) por step, gateado tras `agent_transcript_tools` (default off) para el replay; `stop_reason` y el marcador de respuesta parcial corren sin flag.
2. **Turno abortado/error pierde el mensaje del usuario** — resuelto en Bolt 1: persist-once en todo camino terminal, incluido el cierre sin evento terminal.
3. **Tool results sin presupuesto dentro del turno** — overflow lo detecta el provider, no el harness.
4. **`tool-error` invisible** — resuelto en Bolt 1: `agent.tool.error` + contadores `toolCalls`/`toolErrors` en `agent.turn.health`; `repairToolCall` sigue pendiente.
5. **Bug real** — resuelto en Bolt 1: `suggest-organization.handler.ts` pasaba la IP cruda donde la firma espera `reservedIpSubject` hasheado, sin que hubiera reserva IP → `correctUsage` contra subject inexistente, contadores Redis negativos con IP en claro como key.
6. **Output sin guardrails** — assistant del historial nunca se re-escanea; texto envenenado se persiste y replaya.
7. **Flags de defensa off por default** — `agent_injection_classifier`, `agent_scan_retrieved_notes` (documentado en `docs/AI.md`).
8. **Artifacts sin injection guard** — 48k chars de nota van directo al modelo (`generate-artifact.handler.ts`); ídem `learn-topic.handler.ts`.
9. **Política divergente agente↔MCP** — delete irreversible sin equivalente HITL; catálogos/schemas duplicados.
10. **`temperature` hardcoded 0.7 + `maxOutputTokens` global** ignorando el techo por modelo que el catálogo ya persiste.
11. **Agotar `maxSteps` es silencioso** — resuelto en Bolt 1: `done` lleva `stopReason` (`completed` | `max_steps` | `length` | `token_budget` | `content_filter`) y cada caso anómalo deja un warn.
12. **BYOK pierde toda la resiliencia** — sin fallback chain ni failover por step.
13. **Evals nightly-only**, single-trial, 1 caso E2E de injection.
14. **Sin correlación trace↔costo** en observabilidad.
15. **Sin dead-letter** para reconciliación de usage fallida (reserva colgada hasta rollover diario).

---

## Parte 2 — Benchmark de industria (2025–2026)

Leyenda: **[CONSENSO]** = multi-vendor/estándar · **[VENDOR]** = posición de un vendor · **[PAPER]** = investigación influyente.

### 2.1 Agent Loop

- **Stop conditions [CONSENSO]**: doble condición siempre — terminación natural (sin tool calls / señal semántica) + cap duro (turnos y/o presupuesto). Claude Agent SDK: `maxTurns` + `maxBudgetUsd` nativo ("Setting a budget is a good default for production agents"), con subtypes `error_max_turns`/`error_max_budget_usd` explícitos. OpenAI: `max_turns` lanza `MaxTurnsExceeded`. Vercel: `stopWhen` first-class con `stepCountIs` (la clase `Agent` usa `stepCountIs(20)` por default; `streamText`/`generateText` usan `stepCountIs(1)`), custom por costo acumulado. Google ADK: `max_iterations` + escalación semántica, combinar ambos.
- **Persistencia de tool calls [CONSENSO unánime]**: persistir `tool_use`/`tool_result` completos como source of truth. OpenAI `result.to_input_list()` / Sessions; Claude SDK conserva transcript completo y el context editing recorta server-side "while your client maintains the full unmodified history"; Vercel `result.messages` incluye tool calls/results. La poda es una transformación en el borde (compaction, `prepareStep`, `input_filter`), nunca pérdida del registro.
- **Streaming de tool events [CONSENSO]**: eventos tipados por fase. Vercel UI: máquina de estados `input-streaming → input-available → output-available/output-error` (+ estados HITL `approval-requested/responded`). Claude SDK: stream tipado (`AssistantMessage`, `UserMessage` con tool results, `StreamEvent`, `ResultMessage` con usage/costo).
- **Budgets in-loop**: Anthropic multi-agent research — "token usage explains 80% of the variance"; escalar esfuerzo por complejidad con reglas explícitas. El budget debe vivir en capa de gobierno que corta antes de la siguiente llamada: una alerta sin enforcement no frena un loop.

### 2.2 Tool design

- **Naming/schemas [CONSENSO]**: namespacing por servicio/recurso, parámetros no ambiguos, identificadores semánticos, descripciones como onboarding doc, poka-yoke en argumentos. Pocas tools de alto impacto; consolidar; el solape importa más que el número (OpenAI: >15 bien definidas OK, <10 solapadas mal).
- **Error handling [CONSENSO unánime]**: el error de tool es un tool_result más que vuelve al modelo con información accionable ("specific and actionable improvements, not opaque error codes"); nunca se traga ni rompe el loop. Google ADK: dict con `status`, no excepciones.
- **Tool repair**: Vercel `experimental_repairToolCall` (re-generar args contra schema, o re-ask con el error) — único first-class.
- **Response bounding [CONSENSO]**: paginación/rangos/truncation con defaults sensatos; Claude Code trunca tool responses a 25k tokens por default (Anthropic, _Writing effective tools for agents_, sep-2025); en truncamientos incluir guía hacia búsquedas más específicas; `response_format: concise|detailed`.

### 2.3 Context Management

- **Compaction [CONSENSO en dirección]**: Claude Agent SDK compacta automáticamente cerca del límite (evento `compact_boundary`; reglas persistentes van en CLAUDE.md porque la compaction puede perderlas). Claude API: primitivas server-side `clear_tool_uses_20250919` (trigger 100k, keep 3 pares recientes) y `clear_thinking`. Qué preservar: decisiones de arquitectura, bugs sin resolver; descartar tool outputs redundantes.
- **"Context rot" [Anthropic]**: contexto = recurso finito con retornos marginales decrecientes; presupuestar deliberadamente. Budgets dinámicos en runtime (`prepareStep` de Vercel, triggers configurables de Claude API).
- **Just-in-time retrieval [CONSENSO]**: identificadores livianos + carga por tools en runtime, sobre pre-loading. Structured note-taking (memoria externa) como complemento.
- **Sub-agents para aislar contexto**: exploran con decenas de miles de tokens y devuelven un resumen de 1-2k, de modo que el contexto del orquestador no se satura de resultados intermedios (Anthropic, _How we built our multi-agent research system_, jun-2025).

### 2.4 Model config

- **Routing [CONSENSO]**: prototipar con el modelo más capaz para baseline, luego degradar donde los evals lo permitan. Guardrails corren en modelos chicos; tareas simples en modelos rápidos.
- **Sampling por step**: Vercel `prepareStep` — override por step de temperature/maxOutputTokens/model/activeTools/toolChoice. Claude SDK: `effort` por sesión y por subagent.
- **Fallbacks**: manejo explícito de refusals (`stop_reason`), resumir sesión con límites más altos como recuperación, ejecución durable con checkpoints.

### 2.5 Seguridad (OWASP + estado del arte)

- **OWASP LLM01 (Prompt Injection)**: no hay prevención infalible — todo es mitigación: constrain behavior, validar output con código determinista, filtros como capa, least privilege, HITL para acciones privilegiadas, segregar/marcar contenido externo, adversarial testing.
- **Lethal trifecta [Willison, CONSENSO]**: datos privados + contenido no confiable + comunicación externa = exfiltración. La defensa es arquitectónica (eliminar una pata), no detección. "95% de detección es nota reprobatoria en seguridad web."
- **Design patterns [PAPER multi-org, arXiv 2506.08837]**: una vez ingerido input no confiable, el agente debe quedar imposibilitado de disparar acciones consecuentes. Patrones: Action-Selector, Plan-Then-Execute, Map-Reduce, Dual LLM, Code-Then-Execute, Context-Minimization.
- **CaMeL [DeepMind, arXiv 2503.18813]**: control/data flow extraído del pedido confiable; datos no confiables jamás afectan el flujo; capabilities por valor. Dirección más prometedora, sin implementación mainstream aún.
- **Spotlighting [Microsoft, arXiv 2403.14720]**: delimiting/datamarking/encoding de input no confiable; datamarking redujo ASR de ~50% a <3%.
- **OWASP LLM05 (Output Handling)**: tratar el output del modelo como input de usuario (zero-trust); encoding context-aware; parameterized queries; CSP.
- **OWASP LLM06 (Excessive Agency)**: minimizar tools y funcionalidad; evitar tools open-ended; ejecutar en contexto del usuario con scope mínimo; complete mediation (autorización en el recurso, nunca confiar en el LLM); HITL para alto impacto; rate limiting como limitador de daño.
- **OWASP Agentic Top 10 (dic-2025)**: ASI01 Goal Hijack, ASI02 Tool Misuse (denial-of-wallet), ASI03 Identity & Privilege Abuse, ASI06 Memory & Context Poisoning, ASI09 Human-Agent Trust Exploitation (decision fatigue en HITL — las aprobaciones deben mostrar la acción exacta).
- **MCP spec (2025-06-18)**: consent explícito por tool en el host; tool descriptions = untrusted; RFC 8707 audiencia obligatoria; token passthrough prohibido; sessions nunca como auth; scope minimization.
- **HITL [CONSENSO]**: gates por defecto para deletes irreversibles, envíos externos, shell/código, producción, gasto. Enforcement fuera del modelo ("Permission rules are enforced by Claude Code, not by the model"). OpenAI: `needsApproval` por tool con estado serializable y resume; malformed JSON falla cerrado.
- **Output moderation**: obligatorio el output handling estructural (LLM05) siempre; moderación semántica (Llama Guard 4, OpenAI moderation) obligatoria cuando el output llega a terceros o hay datos regulados; opcional en agentes internos donde se priorizan guardrails de acción. PII: Presidio como referencia OSS; masking (higiene) vs blocking (compliance).
- **Cost controls [CONSENSO]**: max_turns + timeout por invocación + budget diario/por sesión en tokens o USD, con enforcement duro versionado en git.

### 2.6 Verify + Evals

- **Verify como etapa del loop [CONSENSO, liderado por Anthropic]**: ciclo canónico "gather context → take action → verify work → repeat". Jerarquía: (1) reglas deterministas (linters/tests/schemas — "the best form of feedback"), (2) feedback visual, (3) LLM-as-judge último recurso.
- **Grader en contexto fresco [Anthropic Cookbook "Outcomes"]**: auto-verificación sufre self-verification bias (el agente racionaliza sus atajos); grader stateless, solo rubric + artefacto, con rubrics de evidencia ("fetch la URL, busca el quote verbatim"); loop needs_revision → re-grade.
- **Groundedness runtime [CONSENSO]**: baseline = eval offline + monitoring asíncrono sobre traces; guardrails inline solo en flujos de alto riesgo (latencia + sobre-disparo).
- **CI dual [CONSENSO]**: regresión determinista como PR gate (paths-filtered, threshold <100%, caché de respuestas, modelo barato) + suite completa nightly. Anthropic distingue capability evals (hill-climbing) de regression evals (~100%, cada commit).
- **Multi-trial [CONSENSO, origen Anthropic]**: comportamiento agéntico estocástico — nunca un solo trial. `pass@k` (un éxito basta) vs `pass^k` (consistencia exigida; 75% por trial → pass^3 ≈ 42%). Promptfoo: `repeat`/`repeat-min-pass`. Aislamiento de estado entre trials.
- **Graders**: code-based > model-based > humano; "grade what the agent produced, not the path it took"; judges calibrados contra humanos, con escape hatch, uno por dimensión; leer transcripts regularmente.
- **Observabilidad**: OTel GenAI semconv en estado "Development" para agentes (spans `invoke_agent`/`execute_tool`, atributos `gen_ai.conversation.id`, `gen_ai.usage.*`; contenido opt-in). Langfuse: trace = un run, session agrupa, nombres estables verbo-primero, costo requiere model+usage por generation, feedback como scores (nunca tags). Métricas emergentes estándar: steps/task, **tool error rate** (alerta #1 recomendada), retry storms, cost per session/task.
- **Persistencia de trayectorias [CONSENSO]**: transcript completo con tool calls como eventos de primera clase (append-only), separado del checkpointing de estado para replay/fork (LangGraph checkpointers, AgentCore session replay).
- **Flywheel producción→eval [CONSENSO fuerte]**: feedback explícito (thumbs, <1% participación típica) + implícito (retries, abandono, regeneraciones) como scores → annotation queue → dataset → regresión en CI. Anthropic: "convert user-reported failures into test cases"; empezar con 20–50 tareas de fallas reales.

### 2.7 Fuentes primarias

**Vendors:** Anthropic [Building effective agents](https://www.anthropic.com/engineering/building-effective-agents) · [Multi-agent research system](https://www.anthropic.com/engineering/multi-agent-research-system) · [Writing effective tools](https://www.anthropic.com/engineering/writing-tools-for-agents) · [Effective context engineering](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents) · [Building agents with the Claude Agent SDK](https://claude.com/blog/building-agents-with-the-claude-agent-sdk) · [Agent loop docs](https://code.claude.com/docs/en/agent-sdk/agent-loop) · [Context editing](https://platform.claude.com/docs/en/build-with-claude/context-editing) · [Dynamic workflows](https://claude.com/blog/a-harness-for-every-task-dynamic-workflows-in-claude-code) · [Demystifying evals](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents) · [Outcome grader cookbook](https://platform.claude.com/cookbook/managed-agents-cma-verify-with-outcome-grader) · OpenAI [A practical guide to building agents (PDF)](https://cdn.openai.com/business-guides-and-resources/a-practical-guide-to-building-agents.pdf) · [Agents SDK: running](https://openai.github.io/openai-agents-python/running_agents/) / [guardrails](https://openai.github.io/openai-agents-python/guardrails/) / [handoffs](https://openai.github.io/openai-agents-python/handoffs/) / [HITL](https://openai.github.io/openai-agents-js/guides/human-in-the-loop/) · Vercel AI SDK [loop control](https://ai-sdk.dev/docs/agents/loop-control) / [tools](https://ai-sdk.dev/docs/ai-sdk-core/tools-and-tool-calling) / [chatbot tool usage](https://ai-sdk.dev/docs/ai-sdk-ui/chatbot-tool-usage) · Google ADK [LoopAgent](https://adk.dev/agents/workflow-agents/loop-agents/) / [function tools](https://adk.dev/tools-custom/function-tools/) · [Claude Code permissions](https://code.claude.com/docs/en/permissions) / [security](https://code.claude.com/docs/en/security)

**Seguridad:** [OWASP LLM Top 10 2025](https://genai.owasp.org/llm-top-10/) (LLM01/02/05/06/08/10) · [OWASP Agentic Top 10 2026](https://genai.owasp.org/2025/12/09/owasp-top-10-for-agentic-applications-the-benchmark-for-agentic-security-in-the-age-of-autonomous-ai/) · [Agentic Threats & Mitigations](https://genai.owasp.org/resource/agentic-ai-threats-and-mitigations/) · Willison [Lethal trifecta](https://simonwillison.net/2025/Jun/16/the-lethal-trifecta/) / [Dual LLM](https://simonwillison.net/2023/Apr/25/dual-llm-pattern/) · [CaMeL (arXiv 2503.18813)](https://arxiv.org/abs/2503.18813) · [Design Patterns for Securing LLM Agents (arXiv 2506.08837)](https://arxiv.org/abs/2506.08837) · [Spotlighting (arXiv 2403.14720)](https://arxiv.org/abs/2403.14720) · [MSRC indirect PI defense](https://www.microsoft.com/en-us/msrc/blog/2025/07/how-microsoft-defends-against-indirect-prompt-injection-attacks) · [MCP authorization](https://modelcontextprotocol.io/specification/2025-06-18/basic/authorization) / [security best practices](https://modelcontextprotocol.io/specification/2025-06-18/basic/security_best_practices) · [Llama Guard 4](https://github.com/meta-llama/PurpleLlama/blob/main/Llama-Guard4/12B/MODEL_CARD.md)

**Evals/observabilidad:** [Promptfoo CI/CD](https://www.promptfoo.dev/docs/integrations/ci-cd/) · [Braintrust CI/CD 2025](https://www.braintrust.dev/articles/best-ai-evals-tools-cicd-2025) / [hallucination tools 2026](https://www.braintrust.dev/articles/best-hallucination-detection-tools-2026) · [LangSmith trajectory evals](https://docs.langchain.com/langsmith/trajectory-evals) · [OTel GenAI agent spans](https://github.com/open-telemetry/semantic-conventions-genai/blob/main/docs/gen-ai/gen-ai-agent-spans.md) / [GenAI observability blog](https://opentelemetry.io/blog/2026/genai-observability/) · [Langfuse best practices](https://langfuse.com/docs/observability/best-practices) / [annotation queues](https://langfuse.com/docs/evaluation/evaluation-methods/annotation-queues) · [LangGraph checkpointers](https://docs.langchain.com/oss/python/langgraph/checkpointers)

---

## Parte 3 — Cruce: knowtis vs consenso

### 3.1 Donde knowtis ya cumple (o supera) el consenso

| Práctica de consenso                                          | Fuente                                  | Knowtis                                                                                                          |
| ------------------------------------------------------------- | --------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Doble stop: natural + cap duro                                | Anthropic, OpenAI, Vercel, ADK          | ✅ maxSteps + presupuesto de tokens por turno (Bolt 1) + 300s + stall + TTFT + abort                             |
| Injection contenida arquitectónicamente                       | OWASP LLM01, Willison, arXiv 2506.08837 | ✅ fencing (≈spotlighting), allowlist egress (rompe pata de exfiltración), regex+classifier como capa secundaria |
| Just-in-time retrieval                                        | Anthropic                               | ✅ contenido por tool, cap 10k, nunca en prompt inicial                                                          |
| HITL con enforcement fuera del modelo mostrando acción exacta | OWASP LLM06, MCP spec, Claude Code      | ✅ propose→approve con diff, CASL al commit, Redis single-use                                                    |
| Tools granulares en contexto del usuario                      | OWASP LLM06                             | ✅ 9 tools específicas, scoping SQL                                                                              |
| Complete mediation en toda superficie                         | OWASP LLM06 #7, RFC 8707                | ✅ MCP atraviesa controllers con CASL; audiencia validada                                                        |
| Error de tool vuelve al modelo                                | Consenso unánime                        | ✅ default del Vercel SDK                                                                                        |
| Response bounding                                             | Anthropic                               | ✅ caps en todas las tools                                                                                       |
| Telemetría estructural (stall/retry/health)                   | Emergente                               | ✅ por encima de la media                                                                                        |

### 3.2 Divergencias confirmadas por la industria

1. **Persistir transcript completo con tool calls** — resuelto en Bolt 2 / SP1 (2026-08-30): `parts` persiste tool_use/tool_result por step; el replay verbatim sigue tras el flag `agent_transcript_tools` (default off).
2. **Budget económico dentro del loop** — first-class en 2026 (`maxBudgetUsd`); knowtis solo gatea pre-turno con estimación.
3. **Agotar max steps debe señalizarse** — SDKs lanzan error explícito; knowtis emite `done` silencioso.
4. **Presupuesto de contexto dinámico + compaction** — budget fijo 12k desacoplado de `maxInputTokens` que el catálogo ya tiene.
5. **Evals: dual CI + multi-trial pass@k** — knowtis nightly-only, single-trial.
6. **Verify con grader fresco / scoring asíncrono** — knowtis tiene capa determinista pero cero verificación semántica ni async.
7. **Tool events al cliente** — el SDK que usan lo trae de fábrica; no emiten nada.
8. **Sampling por step** — `prepareStep` disponible en su dependencia; temperature hardcoded.

### 3.3 Gaps nuevos destapados por el research

- **Flywheel producción→eval ausente**: sin captura de feedback como scores ni conversión de fallas a casos de eval.
- **`experimental_repairToolCall` sin usar.**
- **OTel GenAI semconv**: adoptar atributos `gen_ai.*` + propagar `requestId` a telemetría cerraría la correlación trace↔costo.
- **Tool error rate**: la métrica/alerta #1 recomendada por la industria; instrumentada en Bolt 1 (`agent.tool.error` + `toolErrors` en `agent.turn.health`), falta la alerta.

### 3.4 Priorización final

| #   | Acción                                                                                                                                                                  | Esfuerzo   | Respaldo                                                 |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | -------------------------------------------------------- |
| 1   | Persistir tool_use/tool_result (schema `conversation_messages` + roles) (resuelto en Bolt 2 / SP1 — 2026-08-30; replay tras flag `agent_transcript_tools`, default off) | Medio      | Consenso unánime                                         |
| 2   | Instrumentar `tool-error` + métrica tool error rate (resuelto en Bolt 1 — 2026-08-27; `repairToolCall` diferido)                                                        | Bajo       | Consenso + primitiva disponible                          |
| 3   | Persistir mensaje user en turnos abortados/error (resuelto en Bolt 1 — 2026-08-27; persistencia de tool calls sigue en #1)                                              | Bajo       | Deriva de #1                                             |
| 4   | Cost/token stop condition en el loop + señal `max_steps` (resuelto en Bolt 1 — 2026-08-27: `AI_AGENT_TURN_TOKEN_BUDGET` + `stopReason` en `done`)                       | Bajo-medio | Claude SDK, OWASP LLM10                                  |
| 5   | Budget de contexto derivado de `maxInputTokens` + contar tool results                                                                                                   | Medio      | Anthropic context engineering                            |
| 6   | Suite de regresión como PR gate (paths-filtered) + pass@k                                                                                                               | Medio      | Promptfoo/Anthropic                                      |
| 7   | Fix bug `releaseReservation` (IP cruda) (resuelto en Bolt 1 — 2026-08-27)                                                                                               | Trivial    | Audit propio                                             |
| 8   | Stream de tool events al cliente                                                                                                                                        | Bajo       | Vercel UI parts                                          |
| 9   | Flywheel feedback→dataset (scores Langfuse)                                                                                                                             | Medio      | Consenso plataformas                                     |
| 10  | Compaction/summarización de historial                                                                                                                                   | Alto       | Anthropic; diferible mientras conversaciones sean cortas |

Nota sobre moderación de output: según consenso, opcional para agente interno cuyo output no se publica — knowtis prioriza guardrails de acción (correcto). Sube a obligatorio si las notas generadas se comparten públicamente.
