# Knowtis AI Integration Research

> **Fecha:** 2026-02-22
> **Estado:** Investigación inicial
> **Objetivo:** Evaluar cómo integrar AI en Knowtis, analizar competidores y proponer features innovadores

---

## Tabla de Contenidos

1. [Estado Actual de Knowtis](#1-estado-actual-de-knowtis)
2. [Competidores en el Mercado con AI](#2-competidores-en-el-mercado-con-ai)
3. [Propuestas de Integración AI para Knowtis](#3-propuestas-de-integración-ai-para-knowtis)
4. [Arquitectura Técnica Propuesta](#4-arquitectura-técnica-propuesta)
5. [Roadmap Sugerido](#5-roadmap-sugerido)

---

## 1. Estado Actual de Knowtis

### Stack Tecnológico

| Capa | Tecnología |
|------|-----------|
| Frontend | React 19, Vite, TanStack Router/Query, Zustand |
| Editor | Tiptap (ProseMirror) con extensiones de colaboración |
| Backend | NestJS 11, DDD/Clean Architecture, CQRS |
| Base de Datos | PostgreSQL 16, Drizzle ORM |
| Tiempo Real | Yjs (CRDT) + Socket.io |
| Monorepo | Nx 22.3 con pnpm |
| Auth | JWT con refresh tokens, CASL permissions |
| Deploy | Vercel (frontend) + Railway (backend) |

### Features Existentes

- **Notas CRUD** con DDD (Value Objects, Result pattern con neverthrow)
- **Colaboración en tiempo real** via Yjs CRDT + Socket.io (WebRTC P2P / WebSocket / Hybrid)
- **Presencia** con cursors colaborativos y awareness API
- **Permisos granulares** (owner/editor/viewer) con CASL
- **Compartir notas** via token público con niveles de acceso
- **Feature flags** basados en environment
- **Auto-save** con debouncing (1000ms)
- **Estado Yjs** persistido como bytea en PostgreSQL

### Puntos de Integración para AI

El codebase **no tiene ninguna integración AI actualmente**. Los puntos ideales de integración son:

1. **Editor Tiptap** — extensiones custom para sugerencias inline, autocompletado, comandos slash
2. **API Backend** — nuevo módulo NestJS `ai` siguiendo el patrón DDD existente
3. **WebSocket Gateway** — streaming de respuestas AI en tiempo real via Socket.io
4. **Base de Datos** — embeddings vectoriales para búsqueda semántica (pgvector)
5. **API Client lib** — nuevo cliente para endpoints de AI

---

## 2. Competidores en el Mercado con AI

### Panorama del Mercado

El mercado de AI note-taking fue valorado en **USD 623.5M en 2025**, proyectado a **USD 3,476M para 2035** (CAGR 18.75%). El 65% de knowledge workers ya usa al menos una herramienta de documentos con AI (Gartner 2024).

### Competidores Principales

#### Tier 1 — Plataformas Dominantes

| Producto | AI Features Clave | LLM Provider | Precio |
|----------|------------------|-------------|--------|
| **Notion AI** | Agents autónomos (multi-step workflows), escritura, resúmenes, transcripción de reuniones, búsqueda cross-app | GPT-5.2, Claude Opus 4.5, Gemini 3 (auto-routing) | $20/user/mes |
| **Microsoft Loop/Copilot** | Generación de contenido complejo, Copilot Pages, integración M365, agents autónomos (2026) | GPT-5.2 | $30/user/mes |
| **Google NotebookLM** | Source-grounded AI, Audio Overviews (podcast AI), modo interactivo, 1M tokens de contexto, Deep Research Agents | Gemini 2.5/3 | Free + Plus tier |

#### Tier 2 — Especializados en AI

| Producto | AI Features Clave | Diferenciador |
|----------|------------------|---------------|
| **Mem AI** | Organización automática sin carpetas, búsqueda en lenguaje natural, Mem Chat | "AI Thought Partner" — zero manual organization |
| **Otter.ai** | Transcripción en tiempo real (95% accuracy), OtterPilot, resúmenes de reuniones, CRM sync | Líder en transcripción de reuniones ($100M+ ARR) |
| **Taskade** | Agents AI custom, Taskade Genesis (apps from prompts), generación de imágenes, MCP connectors | Multi-model (GPT-4, Claude, Mistral), $8/mes |
| **Napkin AI** | Texto → visualizaciones (flowcharts, mind maps, infografías) | Único en text-to-visual, 5M+ usuarios |

#### Tier 3 — Notas con AI Complementario

| Producto | AI Features Clave | Diferenciador |
|----------|------------------|---------------|
| **Craft** | Assistant con búsqueda en lenguaje natural, AI on-device (privacidad) | Apple ecosystem, AI local gratuito |
| **Coda AI** | AI Column (AI a escala en tablas), fórmulas AI, Coda Brain | Hybrid docs + database |
| **Slite** | "Ask" AI con fuentes, búsqueda cross-stack, doc verification | Knowledge management para equipos |
| **Reflect** | Escritura AI con E2E encryption | Privacy-first, zero-knowledge |
| **Obsidian** | Via plugins (Smart Connections, Copilot) — user-configurable | Local-first, 1800+ plugins, cualquier LLM |

#### Open Source con AI

| Proyecto | AI Features | GitHub Stars |
|----------|------------|-------------|
| **AppFlowy** | Modelos AI locales, AI teammate configurable | 67,884 |
| **AFFiNE** | RAG-based assistant, AI para escritura y dibujo | Alto |
| **SiYuan** | Escritura AI, traducción, gramática (OpenAI) | Alto |
| **Open Notebook** | Podcast multi-speaker (como NotebookLM), AI chat, vector search | Emergente |
| **SurfSense** | AI research + knowledge management, 100+ LLMs | Emergente |

### Tendencias Emergentes 2025-2026

1. **Agentic AI** — De asistentes a agentes autónomos (Notion Agents, Copilot Agents, Taskade Genesis)
2. **Audio Overviews** — NotebookLM creó una categoría nueva con podcasts AI generados desde documentos
3. **Knowledge Graphs Temporales** — De almacenamiento plano a grafos que rastrean evolución del conocimiento
4. **Multi-Model Routing** — Soporte multi-proveedor es ahora requisito mínimo
5. **AI On-Device/Edge** — 55% del deep inference será en edge para 2026 (Gartner)
6. **MCP (Model Context Protocol)** — Estándar emergente de Anthropic para conectar AI con herramientas externas
7. **Transcripción sin Bot** — Granola, Jamie capturan audio del dispositivo sin bot visible
8. **AI Learning Companions** — AI personalizado que se adapta al estilo de aprendizaje del usuario

---

## 3. Propuestas de Integración AI para Knowtis

### Propuesta A: "Knowtis Intelligence" — AI Contextual en el Editor (Impacto Alto, Complejidad Media)

**Concepto:** AI integrado directamente en la experiencia de escritura del editor Tiptap.

**Features:**

1. **Slash Commands AI (`/ai`)**
   - `/ai summarize` — Resume la nota actual
   - `/ai expand` — Expande un párrafo seleccionado
   - `/ai translate [lang]` — Traduce contenido
   - `/ai tone [professional|casual|academic]` — Ajusta tono
   - `/ai outline` — Genera outline desde ideas sueltas
   - `/ai action-items` — Extrae action items del contenido

2. **Autocompletado Inteligente (Ghost Text)**
   - Sugerencias inline mientras el usuario escribe (como GitHub Copilot pero para texto)
   - Activado con `Tab` para aceptar, `Esc` para descartar
   - Contextualizado con el contenido de la nota actual

3. **AI Sidebar Panel**
   - Chat conversacional sobre el contenido de la nota
   - "Pregúntale a tu nota" — Q&A sobre el contenido
   - Sugerencias de mejora con diff visual

**Por qué es innovador para Knowtis:** La integración con Yjs permite que las sugerencias AI respeten el estado CRDT y sean compatibles con colaboración en tiempo real. Los usuarios ven las ediciones AI como "un colaborador más".

---

### Propuesta B: "Knowtis Knowledge Graph" — Grafo de Conocimiento Automático (Impacto Muy Alto, Complejidad Alta)

**Concepto:** AI que construye automáticamente un grafo de conocimiento a partir de todas las notas del usuario, descubriendo conexiones, temas y evolución de ideas.

**Features:**

1. **Auto-Linking Semántico**
   - Detecta automáticamente relaciones entre notas
   - Sugiere backlinks basados en similitud semántica
   - Visualización interactiva del grafo (D3.js / React Flow)

2. **Búsqueda Semántica**
   - "¿Qué escribí sobre productividad la semana pasada?"
   - Búsqueda por significado, no solo keywords
   - Powered by embeddings vectoriales (pgvector)

3. **Temporal Knowledge Tracking**
   - Rastreo de cómo evolucionan ideas a lo largo del tiempo
   - Timeline de conceptos: cuándo surgió una idea, cómo cambió
   - "¿Cómo ha cambiado mi pensamiento sobre X?"

4. **Smart Collections**
   - Agrupación automática de notas por tema
   - Sugerencias de organización basadas en contenido
   - Tags automáticos inferidos por AI

**Por qué es innovador:** Ningún competidor combina CRDT colaborativo + knowledge graph temporal. Obsidian tiene grafos manuales, Mem tiene auto-organización — Knowtis puede tener ambos con evolución temporal y colaboración.

---

### Propuesta C: "Knowtis Audio" — Audio Overviews Colaborativos (Impacto Alto, Complejidad Media-Alta)

**Concepto:** Inspirado en NotebookLM, pero con un twist colaborativo: transforma notas compartidas en podcasts AI donde los colaboradores pueden interactuar.

**Features:**

1. **Audio Overview Generation**
   - Convierte una nota (o colección) en un podcast con dos voces AI
   - Formatos: Deep Dive, Resumen Breve, Debate, Q&A
   - Multi-idioma (español, inglés, portugués)

2. **Collaborative Audio Sessions**
   - Los colaboradores pueden "levantar la mano" durante el audio para hacer preguntas
   - El AI pausa, responde, y continúa — en contexto de la colaboración
   - Historial de sesiones de audio por nota

3. **Voice Notes → Structured Content**
   - Grabar notas de voz que se transcriben y estructuran automáticamente
   - AI extrae action items, decisiones, y puntos clave
   - Integración directa en el editor Tiptap

**Por qué es innovador:** NotebookLM es individual. Knowtis Audio sería **el primero en ofrecer audio overviews colaborativos** donde un equipo puede escuchar y discutir con el AI en tiempo real.

---

### Propuesta D: "Knowtis Agents" — Agentes Autónomos para Equipos (Impacto Muy Alto, Complejidad Muy Alta)

**Concepto:** Agentes AI que ejecutan tareas multi-paso de forma autónoma dentro del workspace.

**Features:**

1. **Research Agent**
   - "Investiga los top 5 competidores de [X] y crea una tabla comparativa"
   - Busca en web, analiza fuentes, genera documento estructurado
   - El resultado aparece como una nueva nota compartida

2. **Meeting Agent**
   - Se integra con calendarios y herramientas de videoconferencia
   - Transcribe reuniones y genera notas automáticamente
   - Crea action items y los asigna a colaboradores

3. **Writing Agent**
   - "Toma estas 5 notas y genera un blog post"
   - Combina múltiples fuentes en un documento coherente
   - Respeta el estilo de escritura del usuario

4. **Custom Agents (User-Created)**
   - Los usuarios definen agents con prompts personalizados
   - Ejecución programada o por trigger
   - Compartidos entre el equipo

**Por qué es innovador:** Combina agents (como Notion) con la colaboración en tiempo real de Knowtis. Los agents trabajan **como un miembro más del equipo** — sus ediciones aparecen en tiempo real via Yjs.

---

### Propuesta E: "Knowtis MCP Hub" — Plataforma de Integraciones AI (Impacto Alto, Complejidad Media)

**Concepto:** Implementar un servidor MCP (Model Context Protocol) que exponga las notas de Knowtis a cualquier AI assistant externo.

**Features:**

1. **MCP Server**
   - Expone notas como resources para AI assistants (Claude, Cursor, etc.)
   - Los usuarios pueden consultar sus notas desde cualquier tool AI
   - Permisos granulares (qué notas expone, qué operaciones permite)

2. **MCP Client**
   - Knowtis consume herramientas externas via MCP
   - Conectar GitHub, Slack, Jira, Google Drive
   - AI busca y referencia información de múltiples fuentes

3. **Tool Marketplace**
   - Usuarios crean y comparten MCP tools
   - Integración plug-and-play con herramientas del equipo

**Por qué es innovador:** MCP es el estándar emergente. Ser early adopter posiciona a Knowtis como plataforma abierta, no un walled garden. Taskade acaba de agregar MCP en Feb 2026 — hay ventana de oportunidad.

---

## 4. Arquitectura Técnica Propuesta

### Nuevo Módulo Backend: `ai`

```
apps/api/src/modules/ai/
├── domain/
│   ├── entities/           # AIRequest, AIResponse, Embedding
│   ├── value-objects/       # Prompt, ModelConfig, TokenUsage
│   ├── ports/               # IAIProvider, IEmbeddingStore
│   └── errors/              # AIDomainError
│
├── application/
│   ├── commands/            # GenerateCompletion, GenerateEmbedding
│   ├── queries/             # SemanticSearch, GetSuggestions
│   └── services/            # AIOrchestrator (model routing)
│
├── infrastructure/
│   ├── providers/           # Claude, OpenAI, Ollama adapters
│   ├── embedding/           # pgvector repository
│   └── streaming/           # SSE/WebSocket streaming
│
├── ai.controller.ts
├── ai.gateway.ts            # WebSocket para streaming
├── ai.module.ts
└── ai.guard.ts              # Rate limiting, feature flags
```

### Nueva Lib: `@knowtis/ai-client`

```
libs/ai-client/
├── src/
│   ├── ai.api.ts            # REST endpoints
│   ├── ai-stream.client.ts  # Streaming client (SSE)
│   └── types.ts             # AI request/response types
```

### Database Extensions

```sql
-- Habilitar pgvector
CREATE EXTENSION IF NOT EXISTS vector;

-- Tabla de embeddings
CREATE TABLE note_embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  note_id UUID REFERENCES notes(id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL,
  chunk_text TEXT NOT NULL,
  embedding vector(1536),          -- dimensión según modelo
  model VARCHAR(50) NOT NULL,      -- 'claude-embed-1', 'text-embedding-3-small'
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);

-- Índice para búsqueda vectorial
CREATE INDEX idx_note_embeddings_vector
  ON note_embeddings USING ivfflat (embedding vector_cosine_ops);

-- Tabla de uso AI (para rate limiting y analytics)
CREATE TABLE ai_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  action VARCHAR(50) NOT NULL,      -- 'completion', 'embedding', 'audio'
  model VARCHAR(50) NOT NULL,
  input_tokens INTEGER DEFAULT 0,
  output_tokens INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT now()
);
```

### Provider Pattern (Multi-Model)

```typescript
// Interfaz del puerto (domain layer)
interface IAIProvider {
  generateCompletion(prompt: string, options: CompletionOptions): AsyncIterable<string>;
  generateEmbedding(text: string): Promise<number[]>;
  getModelInfo(): ModelInfo;
}

// Adaptadores (infrastructure layer)
class ClaudeProvider implements IAIProvider { /* Anthropic SDK */ }
class OpenAIProvider implements IAIProvider { /* OpenAI SDK */ }
class OllamaProvider implements IAIProvider { /* Local models */ }

// Orchestrator (application layer)
class AIOrchestrator {
  route(task: AITask): IAIProvider {
    // Auto-routing basado en tipo de tarea, costo, latencia
  }
}
```

### Integración con Tiptap (Frontend)

```typescript
// Extensión Tiptap para AI
const AIExtension = Extension.create({
  name: 'knowtisAI',
  addCommands() {
    return {
      aiComplete: () => ({ /* ghost text completion */ }),
      aiTransform: (action: string) => ({ /* rewrite, summarize, etc. */ }),
    };
  },
  addKeyboardShortcuts() {
    return {
      'Tab': () => this.editor.commands.acceptAISuggestion(),
      'Mod-j': () => this.editor.commands.triggerAIComplete(),
    };
  },
});
```

### Streaming via WebSocket (aprovechando Socket.io existente)

```typescript
// Nuevo namespace en CollaborationGateway o AIGateway separado
@WebSocketGateway({ namespace: '/ai' })
export class AIGateway {
  @SubscribeMessage('ai:complete')
  async handleCompletion(client: Socket, payload: AIRequest) {
    const stream = this.aiService.streamCompletion(payload);
    for await (const chunk of stream) {
      client.emit('ai:chunk', { requestId: payload.id, chunk });
    }
    client.emit('ai:done', { requestId: payload.id });
  }
}
```

---

## 5. Roadmap Sugerido

### Fase 1 — Foundation (4-6 semanas)

- [ ] Crear módulo `ai` en backend con DDD pattern
- [ ] Implementar `IAIProvider` con adaptador Claude (Anthropic SDK)
- [ ] Agregar `pgvector` a PostgreSQL y tabla `note_embeddings`
- [ ] Crear lib `@knowtis/ai-client`
- [ ] Feature flag: `AI_ENABLED`
- [ ] Rate limiting por usuario para AI requests
- [ ] Variables de entorno: `ANTHROPIC_API_KEY`, `AI_MODEL`, `AI_MAX_TOKENS`

### Fase 2 — Editor AI (3-4 semanas)

- [ ] Slash commands AI en Tiptap (`/ai summarize`, `/ai expand`, etc.)
- [ ] Streaming de respuestas via Socket.io
- [ ] AI Sidebar panel con chat contextual
- [ ] UI components en design system (`AIPanel`, `AISlashMenu`, `GhostText`)

### Fase 3 — Semantic Search (3-4 semanas)

- [ ] Pipeline de generación de embeddings (on note save, debounced)
- [ ] Endpoint de búsqueda semántica
- [ ] UI de búsqueda mejorada con resultados semánticos
- [ ] Auto-linking: sugerencias de notas relacionadas

### Fase 4 — Knowledge Graph (4-6 semanas)

- [ ] Extracción de entidades y relaciones con AI
- [ ] Tabla `knowledge_graph_edges` en DB
- [ ] Visualización interactiva del grafo (React Flow)
- [ ] Smart Collections automáticas
- [ ] Tracking temporal de conceptos

### Fase 5 — Audio & Agents (6-8 semanas)

- [ ] Audio Overview generation (TTS + AI script)
- [ ] Voice notes con transcripción
- [ ] Agent framework básico
- [ ] MCP server para exponer notas

---

## Recomendación Final

**Empezar con Propuesta A (Knowtis Intelligence)** porque:

1. **Mayor impacto visible** — los usuarios interactúan con AI directamente en el editor
2. **Complejidad manejable** — aprovecha la infraestructura existente (Tiptap, Socket.io)
3. **Diferenciador inmediato** — slash commands + streaming en editor colaborativo
4. **Base para todo lo demás** — el módulo AI backend se reutiliza en todas las propuestas posteriores

La **Propuesta B (Knowledge Graph)** debería ser la segunda prioridad porque es el diferenciador más fuerte vs. competidores: ninguna plataforma combina CRDT colaborativo con knowledge graph temporal.

### Proveedor AI Recomendado

**Claude (Anthropic)** como proveedor principal:
- API madura con streaming
- Claude Haiku 4.5 para tareas rápidas (autocompletado, sugerencias) — bajo costo, baja latencia
- Claude Sonnet 4.6 para tareas complejas (resúmenes, análisis, agents)
- Anthropic SDK oficial para Node.js
- MCP nativo para integraciones futuras

Con arquitectura multi-provider para flexibilidad futura (OpenAI, Ollama para local).

---

## Fuentes

- [AI Note Taking Market — Precedence Research](https://www.precedenceresearch.com/ai-note-taking-market)
- [Notion AI Releases 2026](https://www.notion.com/releases/2026-01-20)
- [NotebookLM Audio Overviews — Google Blog](https://blog.google/technology/ai/notebooklm-audio-overviews/)
- [AI Trends 2026 — IBM](https://www.ibm.com/think/news/ai-tech-trends-predictions-2026)
- [Knowledge Graphs Reshaping AI — Beam.ai](https://beam.ai/agentic-insights/5-ways-knowledge-graphs-are-quietly-reshaping-ai-workflows-in-2025-2026)
- [Taskade AI Review 2026](https://aichief.com/ai-business-tools/taskade-ai/)
- [Open Notebook — GitHub](https://github.com/lfnovo/open-notebook)
- [AppFlowy — GitHub](https://github.com/AppFlowy-IO/AppFlowy)
- [MCP — Anthropic](https://modelcontextprotocol.io)
