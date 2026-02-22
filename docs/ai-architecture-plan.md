# Knowtis AI — Architecture Plan: Proposals A + E

> **Fecha:** 2026-02-22
> **Estado:** Plan de arquitectura refinado
> **Propuesta A:** Knowtis Intelligence — AI contextual en el editor
> **Propuesta E:** Knowtis MCP Hub — Plataforma de integraciones AI
> **Objetivo:** Arquitectura top-level, production-grade, sin sobre-ingeniería

---

## Tabla de Contenidos

1. [Decisiones Arquitectónicas Clave](#1-decisiones-arquitectónicas-clave)
2. [Monorepo: Estructura Objetivo](#2-monorepo-estructura-objetivo)
3. [Propuesta A: Arquitectura Detallada](#3-propuesta-a-arquitectura-detallada)
4. [Propuesta E: Arquitectura Detallada](#4-propuesta-e-arquitectura-detallada)
5. [Dependencias Entre A y E](#5-dependencias-entre-a-y-e)
6. [Estrategia de Base de Datos](#6-estrategia-de-base-de-datos)
7. [Seguridad y Rate Limiting](#7-seguridad-y-rate-limiting)
8. [CI/CD: Cambios al Pipeline](#8-cicd-cambios-al-pipeline)
9. [Plan de Implementación](#9-plan-de-implementación)

---

## 1. Decisiones Arquitectónicas Clave

### 1.1 MCP como App Separada (No Embebido en API)

**Decisión:** Crear `apps/mcp/` como una aplicación NestJS independiente.

**Razón:** El API existente corre Socket.io para Yjs (colaboración en tiempo real). El tráfico MCP de agentes AI es bursty e impredecible. Mezclarlos en un solo proceso crea contención por el event loop de Node.js — los movimientos de cursor y sync de documentos compiten con tool calls de agentes AI.

**Evidencia:**
- The New Stack (feb 2026): *"Elevating the MCP server to a fully validated microservice is essential for production."*
- AWS, Cloudflare, Sentry, Notion, Stripe: todos despliegan MCP como servicios independientes
- El spec MCP dice: *"Each MCP server should have one clear, well-defined purpose"*

**Alternativa descartada:** Embeber `@rekog/mcp-nest` en `apps/api`. Descartada por acoplamiento de scaling, blast radius compartido, y contención con WebSocket/Yjs.

### 1.2 MCP Llama al API via HTTP (No Acceso Directo a DB)

**Decisión:** En la versión inicial, `apps/mcp/` consume `apps/api/` como un cliente HTTP interno. No tiene conexión directa a PostgreSQL.

**Razón:**
- Mantiene la lógica de dominio, validaciones, y permisos en un solo lugar (el API)
- No requiere extraer el schema Drizzle a una lib compartida (refactor grande)
- Más fácil de razonar sobre seguridad — el MCP server no puede bypasear validaciones
- Si el API ya valida permisos para las notas, el MCP hereda esa protección

**Trade-off:** Agrega ~1-5ms de latencia por cada tool call (network hop local). Aceptable porque los tool calls de agentes AI ya tienen latencia de LLM (300-2000ms).

**Evolución futura:** Si el volumen de reads MCP crece significativamente, extraer el schema Drizzle a `libs/shared/database/` y dar acceso read-only directo al MCP server con su propio connection pool.

### 1.3 AI Module Dentro del API (No Separado)

**Decisión:** El módulo AI (Propuesta A) vive dentro de `apps/api/src/modules/ai/`. No es un servicio separado.

**Razón:**
- Las features de AI del editor (slash commands, ghost text, sidebar) son parte integral de la experiencia de la app
- Necesitan acceso directo al contenido de las notas, permisos del usuario, y el WebSocket gateway
- El tráfico AI del editor es proporcional al tráfico de usuarios — no es independiente como el MCP
- Separar el AI module agregaría complejidad sin beneficio real (solo un consumer: la app)

### 1.4 Streaming via Socket.io (No SSE Adicional)

**Decisión:** El streaming de respuestas AI usa Socket.io en un namespace separado `/ai`.

**Razón:** Ya existe infraestructura Socket.io para Yjs. Agregar SSE sería una segunda conexión innecesaria. Socket.io ya maneja reconexión, multiplexing, y autenticación.

### 1.5 Vercel AI SDK como SDK Principal

**Decisión:** Usar `ai` (Vercel AI SDK) como abstracción principal. `@anthropic-ai/sdk` directo solo para features exclusivas de Anthropic (prompt caching, batches, token counting).

**Razón:** Provider-agnostic, first-class NestJS support, streaming nativo, structured output con Zod. Cambiar de Claude a GPT es cambiar un string.

---

## 2. Monorepo: Estructura Objetivo

### 2.1 Vista General

```
apps/
├── api/              # NestJS backend existente + nuevo módulo AI
├── notes/            # React frontend existente + extensiones Tiptap AI
└── mcp/              # NUEVO — MCP server dedicado (NestJS)

libs/
├── api-client/                # Existente — HTTP/WebSocket client
├── authorization/             # Existente
├── data-access/
│   ├── notes/                 # Existente — React Query hooks para notas
│   ├── users/                 # Existente
│   ├── feature-flags/         # Existente
│   └── ai/                    # NUEVO — React Query hooks para AI
├── design-system/             # Existente — se agregan AI components
└── shared/
    ├── hooks/                 # Existente
    ├── types/                 # Existente — se agregan AI types
    └── util/                  # Existente
```

### 2.2 Nuevos Proyectos Nx

| Proyecto | Tipo | Tags | Path | Descripción |
|----------|------|------|------|-------------|
| `mcp` | app | `type:app, scope:api` | `apps/mcp/` | MCP server NestJS |
| `@knowtis/data-access-ai` | lib | `type:data-access, scope:shared` | `libs/data-access/ai/` | React Query hooks + Zod schemas para AI |

### 2.3 Path Aliases Nuevos

```json
// tsconfig.base.json — agregar:
{
  "paths": {
    "@knowtis/data-access-ai": ["libs/data-access/ai/src/index.ts"]
  }
}
```

### 2.4 Dependency Graph

```
┌──────────────┐     ┌───────────────────────┐     ┌──────────────────┐
│  apps/notes   │────►│ @knowtis/data-access-ai│────►│ @knowtis/api-client│
│  (frontend)   │     │ (React Query hooks)    │     │ (HTTP client)     │
└──────┬───────┘     └───────────────────────┘     └────────┬─────────┘
       │                                                      │
       │              ┌───────────────────────┐               │
       ├─────────────►│ @knowtis/shared-types  │◄─────────────┤
       │              │ (AI types compartidos) │               │
       │              └───────────────────────┘               │
       │                        ▲                              │
       │                        │                              │
       │              ┌─────────┴─────────────┐               │
       │              │    apps/api            │◄──────────────┘
       │              │  ┌─ modules/ai/ ──┐   │
       │              │  │  (DDD module)  │   │   HTTP interno
       │              │  └────────────────┘   │◄──────────────┐
       │              │  ┌─ modules/notes/ ┐  │               │
       │              │  │  (existente)    │  │         ┌─────┴──────┐
       │              │  └─────────────────┘  │         │  apps/mcp  │
       │              └───────────────────────┘         │  (MCP srv) │
       │                                                └────────────┘
       │              ┌───────────────────────┐
       └─────────────►│ @knowtis/design-system│
                      │ (AI UI components)    │
                      └───────────────────────┘
```

### 2.5 ESLint: Cambios Necesarios

```js
// eslint.config.js — agregar apps/mcp al bloque NestJS:
{
  files: ['apps/api/**/*.ts', 'apps/mcp/**/*.ts', 'packages/*-nestjs/**/*.ts'],
  rules: {
    '@typescript-eslint/no-empty-function': 'off',
    '@typescript-eslint/no-explicit-any': 'warn',
    '@typescript-eslint/no-extraneous-class': 'off',
    '@typescript-eslint/consistent-type-imports': 'off',
  },
},
```

---

## 3. Propuesta A: Arquitectura Detallada

### 3.1 Backend: Módulo AI (`apps/api/src/modules/ai/`)

Sigue el patrón DDD existente del módulo `notes`:

```
modules/ai/
├── ai.module.ts                    # NestJS module
├── ai.controller.ts                # REST endpoints para operaciones non-streaming
├── ai.gateway.ts                   # Socket.io gateway (namespace /ai)
│
├── domain/
│   ├── ports/
│   │   ├── ai-provider.port.ts     # Interface: IAIProvider (generateCompletion, generateEmbedding)
│   │   ├── ai-usage.repository.ts  # Interface: IAIUsageRepository
│   │   └── embedding.repository.ts # Interface: IEmbeddingRepository
│   ├── value-objects/
│   │   ├── ai-model.vo.ts          # Enum: haiku, sonnet + validación
│   │   └── token-usage.vo.ts       # Input/output tokens + costo calculado
│   └── errors/
│       └── ai.errors.ts            # AIDomainError (rate limit, provider error, etc.)
│
├── application/
│   ├── commands/
│   │   ├── complete-text.handler.ts      # Slash commands: summarize, expand, translate, etc.
│   │   ├── generate-embedding.handler.ts # Generar embedding para un chunk de nota
│   │   └── index.ts
│   ├── queries/
│   │   ├── semantic-search.handler.ts    # Búsqueda semántica via pgvector
│   │   ├── ghost-text.handler.ts         # Autocompletado inline (Haiku, streaming)
│   │   └── index.ts
│   └── services/
│       ├── ai-orchestrator.service.ts    # Model routing (haiku vs sonnet según tarea)
│       └── ai-rate-limit.service.ts      # Rate limiting por usuario (tokens/día, costo/día)
│
├── infrastructure/
│   ├── providers/
│   │   ├── anthropic.provider.ts         # Claude via Vercel AI SDK (@ai-sdk/anthropic)
│   │   └── openai-embedding.provider.ts  # Embeddings via OpenAI (text-embedding-3-small)
│   ├── persistence/
│   │   ├── drizzle-embedding.repository.ts   # pgvector queries
│   │   └── drizzle-ai-usage.repository.ts    # Token tracking
│   └── streaming/
│       └── socket-stream.adapter.ts      # Adapta Vercel AI SDK stream → Socket.io events
│
└── dto/
    ├── ai-complete.dto.ts          # Input: action, noteContent, selection
    ├── ai-search.dto.ts            # Input: query, limit, filters
    └── index.ts
```

### 3.2 Endpoints del AI Module

#### REST (non-streaming)

| Método | Path | Descripción |
|--------|------|-------------|
| `POST` | `/api/v1/ai/search` | Búsqueda semántica de notas |
| `POST` | `/api/v1/ai/embeddings` | Trigger manual de re-indexación |
| `GET` | `/api/v1/ai/usage` | Uso de AI del usuario actual |

#### Socket.io (streaming, namespace `/ai`)

| Evento (client → server) | Descripción |
|---------------------------|-------------|
| `ai:complete` | Slash command: summarize, expand, translate, etc. |
| `ai:ghost-text` | Request autocompletado inline |
| `ai:chat` | Chat contextual en sidebar |
| `ai:cancel` | Cancelar stream en curso |

| Evento (server → client) | Descripción |
|---------------------------|-------------|
| `ai:chunk` | Token de texto streameado |
| `ai:tool-call` | Tool call del modelo (si aplica) |
| `ai:done` | Stream completado + usage info |
| `ai:error` | Error (rate limit, provider down, etc.) |

### 3.3 Frontend: Extensiones Tiptap AI

Las extensiones Tiptap viven en `apps/notes/` (solo un consumer):

```
apps/notes/src/
├── features/
│   └── editor/
│       ├── extensions/
│       │   ├── ai-slash-commands.ts     # /ai trigger via @tiptap/suggestion
│       │   ├── ai-ghost-text.ts         # ProseMirror Decoration plugin
│       │   └── index.ts
│       └── components/
│           ├── AISlashMenu.tsx           # Popup de comandos AI
│           ├── AISidebar.tsx             # Panel lateral de chat AI
│           └── AIStreamPreview.tsx       # Preview de respuesta AI streaming
```

### 3.4 Frontend: `@knowtis/data-access-ai`

React Query hooks para consumir la API de AI:

```
libs/data-access/ai/
├── src/
│   ├── index.ts
│   ├── ai.hooks.ts              # useAISearch, useAIUsage, useAIMutation
│   ├── ai.types.ts              # Zod schemas: AICompleteInput, AISearchInput, etc.
│   └── ai-stream.hooks.ts       # useAIStream (Socket.io hook para streaming)
├── project.json                 # Tags: type:data-access, scope:shared
└── tsconfig.lib.json
```

### 3.5 Design System: AI Components

Componentes reutilizables en `@knowtis/design-system`:

```
libs/design-system/src/components/
├── ai/
│   ├── AIBadge.tsx              # Badge "AI" para contenido generado
│   ├── AILoadingIndicator.tsx   # Shimmer/skeleton para streaming
│   ├── AIMarkdownRenderer.tsx   # Renderizar markdown de AI responses
│   └── index.ts
```

### 3.6 Flujo Completo: Slash Command

```
1. Usuario escribe "/ai summarize" en Tiptap
2. @tiptap/suggestion muestra popup → usuario selecciona
3. Extension emite Socket.io event: ai:complete { action: 'summarize', noteContent: '...' }
4. AIGateway recibe → valida JWT → verifica rate limit
5. AIOrchestrator selecciona modelo (Sonnet para summarize)
6. streamText() con Vercel AI SDK → chunks por Socket.io ai:chunk
7. Frontend renderiza en AIStreamPreview (fuera del editor)
8. Al finalizar (ai:done), usuario ve preview con botón "Insert" / "Discard"
9. Si acepta → editor.commands.insertContent(result)
10. ai_usage table actualizada con tokens + costo
```

### 3.7 Flujo Completo: Ghost Text

```
1. Usuario escribe en Tiptap → debounce 500ms
2. Ghost text extension emite: ai:ghost-text { context: últimas 200 palabras }
3. AIGateway → AIOrchestrator selecciona Haiku (rápido, barato)
4. streamText() → primer chunk llega en <300ms (TTFT target)
5. Se acumula el resultado completo (no streaming parcial en ghost text)
6. ai:done → Extension crea ProseMirror Decoration (texto gris, opacity 0.4)
7. Tab → acepta (inserta texto), Esc → descarta, seguir escribiendo → descarta
```

---

## 4. Propuesta E: Arquitectura Detallada

### 4.1 `apps/mcp/` — MCP Server Dedicado

```
apps/mcp/
├── src/
│   ├── main.ts                         # Bootstrap NestJS + McpModule
│   ├── app.module.ts                   # Root module
│   │
│   ├── config/
│   │   ├── mcp.config.ts              # MCP server name, version, capabilities
│   │   └── api-client.config.ts       # URL del API interno, auth config
│   │
│   ├── tools/                          # MCP Tools (equivalente a controllers)
│   │   ├── notes.tool.ts              # search-notes, get-note, create-note, update-note, list-notes
│   │   ├── collaboration.tool.ts      # get-collaborators, share-note
│   │   └── search.tool.ts             # semantic-search (cuando Propuesta A esté lista)
│   │
│   ├── services/
│   │   ├── knowtis-api.client.ts      # HTTP client para llamar a apps/api internamente
│   │   └── auth-context.service.ts    # Extraer usuario del token OAuth/JWT del MCP client
│   │
│   └── guards/
│       └── mcp-auth.guard.ts          # OAuth 2.1 / API key validation
│
├── project.json                        # Tags: type:app, scope:api
├── tsconfig.app.json
├── webpack.config.cjs
└── .env.example
```

### 4.2 MCP Tools Expuestos

| Tool Name | Descripción | Params | Permisos |
|-----------|-------------|--------|----------|
| `search-notes` | Buscar notas por query de texto | `query: string, limit?: number` | Read access |
| `get-note` | Obtener contenido de una nota | `noteId: string` | Read access a esa nota |
| `create-note` | Crear una nota nueva | `title: string, content?: string` | Authenticated |
| `update-note` | Actualizar contenido de una nota | `noteId: string, title?: string, content?: string` | Edit access |
| `list-notes` | Listar notas del usuario | `search?: string, limit?: number` | Authenticated |
| `get-collaborators` | Ver quién tiene acceso | `noteId: string` | Read access a esa nota |
| `share-note` | Compartir nota con otro usuario | `noteId: string, email: string, permission: 'viewer'\|'editor'` | Owner/Editor |
| `semantic-search` | Búsqueda por significado (requiere Propuesta A) | `query: string, limit?: number` | Read access |

### 4.3 Comunicación MCP → API

```
┌──────────────┐      HTTP (interno)       ┌──────────────┐      ┌────────────┐
│   apps/mcp   │ ─────────────────────────►│   apps/api   │─────►│ PostgreSQL │
│              │  Authorization: Bearer X   │              │      └────────────┘
│  MCP Tools   │  X-MCP-User-Id: uuid      │  Controllers │
│              │◄───────────────────────── │  + DDD logic │
│  OAuth 2.1   │      JSON responses       │  + Permisos  │
└──────────────┘                           └──────────────┘

Flujo:
1. Claude Desktop/Cursor envía tool call a apps/mcp (Streamable HTTP)
2. MCP server valida OAuth token → extrae user identity
3. MCP tool traduce params → HTTP request a apps/api
4. API valida permisos (CASL), ejecuta lógica de dominio
5. Respuesta JSON → MCP tool formatea → retorna al AI client
```

### 4.4 `knowtis-api.client.ts` — Cliente HTTP Interno

```typescript
// Patrón: thin wrapper sobre el API existente
// No duplica lógica de dominio — delega todo al API

@Injectable()
export class KnowtisApiClient {
  constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,  // @nestjs/axios
  ) {}

  private get baseUrl(): string {
    return this.configService.getOrThrow<string>('API_INTERNAL_URL');
  }

  // Las operaciones usan el token del usuario MCP
  // para que el API aplique permisos correctamente
  async searchNotes(query: string, limit: number, userToken: string) {
    const { data } = await this.httpService.axiosRef.get(
      `${this.baseUrl}/api/v1/notes`,
      {
        params: { search: query, limit },
        headers: { Authorization: `Bearer ${userToken}` },
      },
    );
    return data;
  }

  async getNote(noteId: string, userToken: string) { /* ... */ }
  async createNote(input: CreateNoteDto, userToken: string) { /* ... */ }
  async updateNote(noteId: string, input: UpdateNoteDto, userToken: string) { /* ... */ }
  // etc.
}
```

### 4.5 Transports

| Transport | Uso | Configuración |
|-----------|-----|---------------|
| **Streamable HTTP** | Producción remota (Claude Desktop, Cursor, VS Code, ChatGPT) | `POST /mcp` + `GET /mcp` (SSE para server-initiated) |
| **stdio** | Desarrollo local, CLI | Flag: `--transport stdio` o entry point separado |

`@rekog/mcp-nest` soporta ambos nativamente. En producción se expone Streamable HTTP. Para desarrollo local, un script separado levanta el server en modo stdio.

### 4.6 Autenticación MCP

**Fase 1 (MVP):** API Key simple en header.
```
Authorization: Bearer knowtis_mcp_<api_key>
```
- Generada por el usuario desde Settings de Knowtis
- Almacenada en la DB (hashed) con scopes configurables
- El MCP server valida la key y la intercambia por un JWT de usuario para llamar al API

**Fase 2 (Production):** OAuth 2.1 completo.
- Authorization Code + PKCE para clientes interactivos (Claude Desktop)
- Client Credentials para M2M (automaciones, CI)
- Protected Resource Metadata (RFC 9728)
- `@rekog/mcp-nest` tiene OAuth 2.1 built-in

### 4.7 Deploy

```yaml
# railway.toml (apps/mcp)
[build]
  builder = "NIXPACKS"
  buildCommand = "pnpm install --frozen-lockfile && npx nx build mcp"

[deploy]
  startCommand = "node dist/apps/mcp/main.js"
  healthcheckPath = "/health"
  healthcheckTimeout = 300

[service]
  internalPort = 3334  # Diferente del API (3333)
```

- Deploy condicional en CI: solo si `nx affected` incluye `mcp`
- Servicio separado en Railway con su propia URL
- Variable de entorno `API_INTERNAL_URL` apunta al servicio del API en Railway (red privada)

---

## 5. Dependencias Entre A y E

### Qué puede implementarse de forma independiente

```
Propuesta E (MCP Hub)          Propuesta A (Intelligence)
├── search-notes       ✅     ├── AI module (DDD)        ✅
├── get-note           ✅     ├── Streaming via Socket.io ✅
├── create-note        ✅     ├── Slash commands          ✅
├── update-note        ✅     ├── Ghost text              ✅
├── list-notes         ✅     ├── AI Sidebar              ✅
├── get-collaborators  ✅     ├── pgvector + embeddings   ✅
├── share-note         ✅     ├── Rate limiting           ✅
│                              │
├── semantic-search    ⚠️ ────┤── Búsqueda semántica      ✅
│   (requiere A)               │   (embeddings pipeline)
```

**`semantic-search` en MCP depende de que Propuesta A tenga el pipeline de embeddings funcionando.** Todos los demás tools son independientes.

### Orden recomendado

1. **Propuesta A primero** — construye la infraestructura AI (módulo backend, streaming, embeddings)
2. **Propuesta E después** — la mayoría de tools MCP son wrappers sobre endpoints CRUD existentes, pero `semantic-search` aprovecha lo construido en A

Ambas pueden comenzar en paralelo si se pospone `semantic-search` en el MCP.

---

## 6. Estrategia de Base de Datos

### 6.1 Nuevas Tablas (Propuesta A)

Se agregan al schema existente en `apps/api/src/database/schema/`:

**`note_embeddings`** — Vectores para búsqueda semántica
```typescript
// apps/api/src/database/schema/note-embeddings.schema.ts
import { pgTable, uuid, integer, text, varchar, timestamp, index } from 'drizzle-orm/pg-core';
import { vector } from 'drizzle-orm/pg-core';  // Drizzle 0.31+ built-in
import { notes } from './notes.schema';

export const noteEmbeddings = pgTable(
  'note_embeddings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    noteId: uuid('note_id').notNull().references(() => notes.id, { onDelete: 'cascade' }),
    chunkIndex: integer('chunk_index').notNull(),
    chunkContent: text('chunk_content').notNull(),
    embedding: vector('embedding', { dimensions: 1536 }),
    model: varchar('model', { length: 50 }).notNull().default('text-embedding-3-small'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_note_embeddings_note_id').on(table.noteId),
    index('idx_note_embeddings_vector').using('hnsw', table.embedding.op('vector_cosine_ops')),
  ],
);
```

**`ai_usage`** — Tracking de tokens y costos por usuario
```typescript
// apps/api/src/database/schema/ai-usage.schema.ts
import { pgTable, uuid, varchar, integer, numeric, timestamp, index } from 'drizzle-orm/pg-core';
import { users } from './users.schema';

export const aiUsage = pgTable(
  'ai_usage',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    action: varchar('action', { length: 50 }).notNull(),    // 'completion', 'ghost-text', 'embedding', 'search'
    model: varchar('model', { length: 80 }).notNull(),       // 'claude-haiku-4-5', 'claude-sonnet-4-5', etc.
    inputTokens: integer('input_tokens').notNull().default(0),
    outputTokens: integer('output_tokens').notNull().default(0),
    costUsd: numeric('cost_usd', { precision: 10, scale: 6 }).notNull().default('0'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_ai_usage_user_date').on(table.userId, table.createdAt),
  ],
);
```

**`mcp_api_keys`** — API keys para Propuesta E
```typescript
// apps/api/src/database/schema/mcp-api-keys.schema.ts
import { pgTable, uuid, varchar, text, timestamp, boolean, index } from 'drizzle-orm/pg-core';
import { users } from './users.schema';

export const mcpApiKeys = pgTable(
  'mcp_api_keys',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 100 }).notNull(),          // "Claude Desktop", "Cursor", etc.
    keyHash: varchar('key_hash', { length: 128 }).notNull(),   // bcrypt hash
    keyPrefix: varchar('key_prefix', { length: 12 }).notNull(), // "knowtis_mcp_a3" para identificación
    scopes: text('scopes').notNull().default('read'),           // 'read', 'read,write', 'read,write,share'
    isActive: boolean('is_active').notNull().default(true),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_mcp_api_keys_user').on(table.userId),
    index('idx_mcp_api_keys_prefix').on(table.keyPrefix),
  ],
);
```

### 6.2 Migrations

```sql
-- Migration 001: Enable pgvector
CREATE EXTENSION IF NOT EXISTS vector;

-- Migration 002: note_embeddings
-- Migration 003: ai_usage
-- Migration 004: mcp_api_keys
```

Ejecutar via Drizzle Kit: `pnpm db:push` o `drizzle-kit generate` → `drizzle-kit migrate`.

### 6.3 Schema No Se Extrae (Por Ahora)

El schema Drizzle sigue en `apps/api/src/database/`. No se extrae a una lib compartida porque:
- Solo `apps/api` accede a la DB directamente
- `apps/mcp` consume el API via HTTP (Decisión 1.2)
- Extraer el schema es un refactor que se puede hacer después si es necesario

---

## 7. Seguridad y Rate Limiting

### 7.1 Rate Limiting (Propuesta A)

| Tier | Límite Diario | Costo Máx/Día | Modelos |
|------|--------------|----------------|---------|
| Free | 50,000 tokens | $0.50 | Solo Haiku |
| Pro | 200,000 tokens | $2.00 | Haiku + Sonnet |
| Team | 500,000 tokens | $5.00 | Haiku + Sonnet |

**Implementación:**
- `ai-rate-limit.service.ts` consulta `ai_usage` table (sumando día actual)
- Estimación pre-request con `gpt-tokenizer` (client-side) + `countTokens()` (server-side)
- Guard en el AIGateway que rechaza con `ai:error { code: 'RATE_LIMIT' }` si excede

### 7.2 Seguridad MCP (Propuesta E)

| Capa | Mecanismo |
|------|-----------|
| **Autenticación** | API Key (fase 1) → OAuth 2.1 (fase 2) |
| **Autorización** | Permisos delegados al API (CASL). MCP tools nunca bypasean. |
| **Rate Limiting** | Independiente del API. Límite por API key: 100 requests/minuto |
| **Input Validation** | Zod schemas en cada `@Tool()` — parámetros validados antes de procesar |
| **Audit Log** | Cada tool call logueada con: user_id, tool_name, params, timestamp |
| **Scopes** | API keys tienen scopes (read, write, share). Tool calls verifican scope. |

### 7.3 Separación de Concerns de Seguridad

```
                   ┌─────── Boundary ───────┐
                   │                        │
  AI Client ──────►│  apps/mcp              │──────► apps/api
  (Claude,         │  - OAuth 2.1 / API Key │        - JWT auth
   Cursor)         │  - MCP rate limiting    │        - CASL permisos
                   │  - Input validation     │        - Domain validation
                   │  - Audit logging        │        - Business rules
                   │                        │
                   └────────────────────────┘

  Browser ────────────────────────────────────────► apps/api
  (notes app)                                       - JWT auth
                                                    - CASL permisos
                                                    - AI rate limiting
                                                    - Domain validation
```

Cada servicio maneja su propia capa de seguridad. No hay "shared auth" — cada uno valida independientemente.

---

## 8. CI/CD: Cambios al Pipeline

### 8.1 GitHub Actions

```yaml
# .github/workflows/ci.yml — cambios:

# 1. Agregar MCP al affected check
- name: Lint, Test, Build
  run: npx nx affected -t lint test build

# 2. Deploy condicional del MCP server
- name: Check if MCP affected
  id: mcp-affected
  run: |
    AFFECTED=$(npx nx show projects --affected --type app)
    echo "mcp_affected=$(echo $AFFECTED | grep -c 'mcp')" >> $GITHUB_OUTPUT

- name: Deploy MCP to Railway
  if: steps.mcp-affected.outputs.mcp_affected != '0'
  run: railway up --service mcp
```

### 8.2 Vercel (Frontend)

Sin cambios — `tools/vercel-ignore.sh notes` sigue funcionando. Las nuevas libs AI se detectan automáticamente como dependencias del frontend.

### 8.3 Railway (Backend)

Dos servicios separados:
- **api** — servicio existente (puerto 3333)
- **mcp** — servicio nuevo (puerto 3334)
- Comunicación interna via Railway private networking

---

## 9. Plan de Implementación

### Fase 1: Foundation AI (Propuesta A — Backend)

**Objetivo:** Módulo AI funcional con streaming y rate limiting.

- [ ] Instalar dependencias: `ai`, `@ai-sdk/anthropic`, `@ai-sdk/openai`, `@anthropic-ai/sdk`, `gpt-tokenizer`
- [ ] Crear `apps/api/src/modules/ai/` con estructura DDD completa
- [ ] Implementar `IAIProvider` port + `AnthropicProvider` adapter
- [ ] Implementar `AIOrchestrator` (model routing: haiku vs sonnet)
- [ ] Crear `AIGateway` (Socket.io namespace `/ai`)
- [ ] Implementar streaming: `streamText()` → Socket.io events
- [ ] Crear tablas: `ai_usage` + `note_embeddings` (migration)
- [ ] Habilitar pgvector extension
- [ ] Implementar `AIRateLimitService`
- [ ] Feature flag: `AI_ENABLED`
- [ ] Variables de entorno: `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `AI_DEFAULT_MODEL`, `AI_FAST_MODEL`
- [ ] Tests unitarios para handlers y orchestrator

### Fase 2: Editor AI (Propuesta A — Frontend)

**Objetivo:** Slash commands y ghost text funcionando en el editor.

- [ ] Crear `@knowtis/data-access-ai` lib (React Query hooks + Zod schemas)
- [ ] Path alias `@knowtis/data-access-ai` en `tsconfig.base.json`
- [ ] Implementar `ai-slash-commands.ts` extension (Tiptap + `@tiptap/suggestion`)
- [ ] Implementar `AISlashMenu.tsx` component (Floating UI popup)
- [ ] Implementar `AIStreamPreview.tsx` (preview de respuesta + insert/discard)
- [ ] Implementar `ai-ghost-text.ts` extension (ProseMirror Decorations)
- [ ] Implementar `AISidebar.tsx` (chat contextual)
- [ ] AI components en design system: `AIBadge`, `AILoadingIndicator`
- [ ] Instalar `prosemirror-suggestion-mode` para track changes
- [ ] Socket.io connection al namespace `/ai`
- [ ] Tests para hooks y componentes

### Fase 3: Embeddings Pipeline (Propuesta A)

**Objetivo:** Búsqueda semántica funcional con pgvector.

- [ ] Pipeline de chunking: dividir contenido de nota en chunks (~500 tokens)
- [ ] Generación de embeddings on note save (debounced, background)
- [ ] Endpoint `/api/v1/ai/search` (búsqueda semántica)
- [ ] UI de búsqueda mejorada con resultados semánticos
- [ ] Auto-linking: sugerencias de notas relacionadas en sidebar
- [ ] Background job: re-indexar notas existentes (Batch API de Anthropic, 50% descuento)
- [ ] HNSW index tuning según volumen de datos

### Fase 4: MCP Server (Propuesta E)

**Objetivo:** MCP server funcional con tools básicos.

- [ ] Crear `apps/mcp/` NestJS app con `@rekog/mcp-nest`
- [ ] `project.json` con tags `type:app, scope:api`
- [ ] Agregar `apps/mcp/**/*.ts` al bloque NestJS en `eslint.config.js`
- [ ] Implementar `KnowtisApiClient` (HTTP client para llamar al API)
- [ ] Implementar tools: `search-notes`, `get-note`, `list-notes`
- [ ] Implementar tools: `create-note`, `update-note`
- [ ] Implementar tools: `get-collaborators`, `share-note`
- [ ] `McpAuthGuard` con API key validation
- [ ] Tabla `mcp_api_keys` + CRUD endpoints en API
- [ ] UI en frontend: Settings → "API Keys" para generar/revocar keys
- [ ] Health check endpoint (`/health`)
- [ ] Configurar deploy en Railway (servicio separado)
- [ ] Agregar MCP deploy condicional al CI pipeline
- [ ] Documentación: cómo conectar Claude Desktop / Cursor a Knowtis
- [ ] Tests para tools y auth

### Fase 5: MCP Avanzado (Propuesta E)

**Objetivo:** OAuth 2.1 y semantic-search tool.

- [ ] `semantic-search` tool (depende de Fase 3)
- [ ] OAuth 2.1 via `@rekog/mcp-nest` built-in
- [ ] Stdio transport para desarrollo local / Claude Desktop
- [ ] Rate limiting por API key (independiente del API)
- [ ] Audit logging de tool calls
- [ ] Registrar en MCP Registry (cuando esté disponible)

---

## Paquetes Finales

### Propuesta A

```bash
# Backend (apps/api)
pnpm add ai @ai-sdk/anthropic @ai-sdk/openai @anthropic-ai/sdk gpt-tokenizer

# Frontend (apps/notes) — track changes en editor
pnpm add prosemirror-suggestion-mode
```

### Propuesta E

```bash
# MCP Server (apps/mcp)
pnpm add @modelcontextprotocol/sdk @rekog/mcp-nest @nestjs/axios
```

### Opcionales (evaluar más adelante)

```bash
# Reranking para RAG avanzado
pnpm add cohere-ai

# MCP client (si Knowtis también consume MCP servers externos)
pnpm add @ai-sdk/mcp

# Tiptap AI Toolkit (si el presupuesto permite $39+/dev/mes)
pnpm add @tiptap-pro/ai-toolkit @tiptap-pro/ai-toolkit-ai-sdk
```

---

## Fuentes

- [MCP Architecture — modelcontextprotocol.io](https://modelcontextprotocol.io/docs/learn/architecture)
- [MCP Specification 2025-11-25](https://modelcontextprotocol.io/specification/2025-11-25)
- [Why the MCP Server Is a Critical Microservice — The New Stack](https://thenewstack.io/why-the-mcp-server-is-now-a-critical-microservice/)
- [15 Best Practices for MCP Servers — The New Stack](https://thenewstack.io/15-best-practices-for-building-mcp-servers-in-production/)
- [Vercel AI SDK — NestJS Cookbook](https://ai-sdk.dev/cookbook/api-servers/nest)
- [@rekog/mcp-nest — GitHub](https://github.com/rekog-labs/MCP-Nest)
- [AWS Guidance for Deploying MCP Servers](https://aws.amazon.com/solutions/guidance/deploying-model-context-protocol-servers-on-aws/)
- [Drizzle pgvector Guide](https://orm.drizzle.team/docs/guides/vector-similarity-search)
- [Liveblocks: AI Copilot in Tiptap](https://liveblocks.io/blog/building-an-ai-copilot-inside-your-tiptap-text-editor)
- [MCP Security Best Practices](https://modelcontextprotocol.io/specification/2025-11-25/basic/security_best_practices)
- [State of MCP Server Security 2025 — Astrix](https://astrix.security/learn/blog/state-of-mcp-server-security-2025/)
