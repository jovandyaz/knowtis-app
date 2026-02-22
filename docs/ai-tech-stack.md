# Knowtis AI Tech Stack — Propuestas A & E

> **Fecha:** 2026-02-22
> **Propuesta A:** Knowtis Intelligence — AI contextual en el editor
> **Propuesta E:** Knowtis MCP Hub — Plataforma de integraciones AI

---

## Tabla de Contenidos

1. [Paquetes Core](#1-paquetes-core)
2. [Propuesta A: Stack del Editor AI](#2-propuesta-a-stack-del-editor-ai)
3. [Propuesta E: Stack MCP](#3-propuesta-e-stack-mcp)
4. [Base de Datos y Embeddings](#4-base-de-datos-y-embeddings)
5. [Streaming: Patrones de Arquitectura](#5-streaming-patrones-de-arquitectura)
6. [Rate Limiting y Costos](#6-rate-limiting-y-costos)
7. [Tendencias y Best Practices 2025-2026](#7-tendencias-y-best-practices-2025-2026)
8. [Comando de Instalación](#8-comando-de-instalación)

---

## 1. Paquetes Core

### AI SDKs — Cuál usar y por qué

| Paquete | Versión | Weekly Downloads | Rol en Knowtis |
|---------|---------|-----------------|----------------|
| **`ai` (Vercel AI SDK)** | 6.0.97 | 3,600+ dependents | **SDK principal** — provider-agnostic, first-class NestJS support, streaming utilities |
| **`@ai-sdk/anthropic`** | 3.0.46 | — | Provider de Claude para Vercel AI SDK |
| **`@ai-sdk/openai`** | — | — | Provider de OpenAI para Vercel AI SDK (embeddings, fallback) |
| **`@anthropic-ai/sdk`** | 0.78.0 | 2.2M+/semana | **SDK directo** — para prompt caching, batches, tool runner beta |
| **`zod`** | — | Ya instalado | Schemas para structured output, tool definitions, MCP |
| **`gpt-tokenizer`** | — | — | Conteo de tokens client-side (rate limiting, estimación de costos) |

### Por qué Vercel AI SDK como SDK principal

1. **First-class NestJS support** — `pipeTextStreamToResponse()` y `pipeUIMessageStreamToResponse()` funcionan directamente con Express/NestJS
2. **Provider-agnostic** — cambiar de Claude a GPT es cambiar un string: `anthropic('claude-sonnet-4-5-20250929')` → `openai('gpt-4o')`
3. **Streaming nativo** — `streamText()`, `streamObject()` con typed events
4. **Tool use con loops** — `ToolLoopAgent`, `stopWhen`, `prepareStep` para agents multi-step
5. **Structured output** — `generateObject()` con Zod schemas, cross-provider
6. **MCP integration** — `@ai-sdk/mcp` para consumir MCP tools directamente

### Cuándo usar `@anthropic-ai/sdk` directamente

- **Prompt caching** — `cache_control: { type: "ephemeral" }` (90% reducción de costos en cache hits)
- **Message Batches API** — hasta 10,000 queries a 50% de descuento (para indexar notas, generar embeddings en bulk)
- **Token counting exacto** — `client.messages.countTokens()` para billing preciso
- **Extended thinking** — reasoning en Opus 4 / Sonnet 4
- **Beta features** — code execution, files API, context management

### Alternativas evaluadas y descartadas

| SDK | Decisión | Razón |
|-----|----------|-------|
| **LangChain.js** (v1.2.7) | Descartado | Demasiado pesado (101kb gzipped), abstracciones innecesarias para nuestro caso. Útil solo si necesitáramos agents complejos con LangGraph |
| **LlamaIndex.TS** (v0.12.1) | Descartado por ahora | Especializado en RAG. pgvector + Drizzle cubre nuestras necesidades. Reconsiderar si necesitamos RAG avanzado |
| **LiteLLM** | Descartado | Proxy Python, overhead innecesario. Vercel AI SDK ya abstrae providers |
| **Portkey** | No por ahora | Agregar solo si necesitamos failover automático entre providers o budget caps a nivel gateway |

---

## 2. Propuesta A: Stack del Editor AI

### 2.1 Slash Commands AI

| Paquete | Rol | Precio |
|---------|-----|--------|
| **`@tiptap/suggestion`** | Core utility para trigger `/` y lifecycle de sugerencias | Gratis (MIT) |
| **Floating UI (`@floating-ui/dom`)** | Posicionamiento de popups (reemplaza tippy.js en Tiptap 3.x) | Gratis |

**Patrón de implementación:**

```typescript
import { Extension } from '@tiptap/core';
import Suggestion from '@tiptap/suggestion';

const AISlashCommands = Extension.create({
  name: 'aiSlashCommands',
  addProseMirrorPlugins() {
    return [
      Suggestion({
        editor: this.editor,
        char: '/',
        items: ({ query }) => {
          const commands = [
            {
              title: 'AI: Resumir',
              searchTerms: ['summarize', 'resumir', 'resumen'],
              command: ({ editor, range }) => {
                editor.chain().focus().deleteRange(range).run();
                // Trigger AI summarization
              },
            },
            {
              title: 'AI: Expandir',
              searchTerms: ['expand', 'expandir', 'desarrollar'],
              command: ({ editor, range }) => {
                editor.chain().focus().deleteRange(range).run();
                // Trigger AI expansion
              },
            },
            {
              title: 'AI: Traducir',
              searchTerms: ['translate', 'traducir'],
              command: ({ editor, range }) => {
                editor.chain().focus().deleteRange(range).run();
                // Trigger AI translation prompt
              },
            },
            {
              title: 'AI: Action Items',
              searchTerms: ['actions', 'tasks', 'tareas'],
              command: ({ editor, range }) => {
                editor.chain().focus().deleteRange(range).run();
                // Trigger action item extraction
              },
            },
          ];
          return commands.filter(cmd =>
            cmd.title.toLowerCase().includes(query.toLowerCase()) ||
            cmd.searchTerms.some(t => t.includes(query.toLowerCase()))
          );
        },
        render: () => {
          // Floating UI popup con lista de comandos
          // onStart, onUpdate, onKeyDown, onExit
        },
      }),
    ];
  },
});
```

### 2.2 Ghost Text (Autocompletado Inline)

**No requiere paquetes adicionales** — se implementa con ProseMirror Decorations nativo.

**Patrón de implementación:**

```typescript
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

const ghostTextKey = new PluginKey('ghostText');

const GhostTextPlugin = new Plugin({
  key: ghostTextKey,
  state: {
    init: () => DecorationSet.empty,
    apply(tr, old) {
      const meta = tr.getMeta(ghostTextKey);
      if (meta?.clear) return DecorationSet.empty;
      if (meta?.suggestion) {
        const pos = tr.selection.$head.pos;
        const widget = Decoration.widget(pos, () => {
          const span = document.createElement('span');
          span.textContent = meta.suggestion;
          span.style.opacity = '0.4';
          span.style.pointerEvents = 'none';
          return span;
        }, { side: 1, key: 'ghost-text' });
        return DecorationSet.create(tr.doc, [widget]);
      }
      return old.map(tr.mapping, tr.doc);
    },
  },
  props: {
    decorations(state) {
      return this.getState(state);
    },
    handleKeyDown(view, event) {
      const decos = ghostTextKey.getState(view.state);
      if (decos.find().length === 0) return false;

      if (event.key === 'Tab') {
        // Aceptar: insertar texto sugerido
        event.preventDefault();
        const suggestion = decos.find()[0];
        // Insert suggestion text...
        return true;
      }
      if (event.key === 'Escape') {
        // Rechazar: limpiar ghost text
        const tr = view.state.tr.setMeta(ghostTextKey, { clear: true });
        view.dispatch(tr);
        return true;
      }
      return false;
    },
  },
});
```

### 2.3 Streaming AI en el Editor

**Opciones evaluadas:**

| Enfoque | Complejidad | Pros | Contras |
|---------|------------|------|---------|
| **Preview + Insert** (recomendado) | Baja | Stream en un `<div>` aparte, insertar resultado final en editor | No es "inline" |
| **Buffer markdown → HTML → insert** | Media | Stream visible en el editor | Flicker en conversiones parciales |
| **Tiptap AI Toolkit** (`@tiptap-pro/ai-toolkit`) | Baja (pero pagado) | `toolkit.streamHtml()` maneja toda la complejidad | $39+/dev/mes |
| **Full doc rewrite + diff** (patrón Liveblocks) | Alta | Ediciones precisas, LLM output completo | Requiere custom JSX markup + diffing |

**Recomendación:** Empezar con **Preview + Insert** (gratis, simple). Evaluar **AI Toolkit** si el presupuesto lo permite — resuelve streaming + review + Yjs de una vez.

**Insight clave de Liveblocks:** "Los LLMs prefieren reescribir, no parchear. Déjalos producir una versión limpia y controla la estructura externamente."

### 2.4 AI como Colaborador Virtual (Yjs)

```typescript
import * as Y from 'yjs';

// Servidor: aplicar ediciones AI como un peer más
const ydoc = new Y.Doc();
Y.applyUpdate(ydoc, currentDocState);

const yxml = ydoc.getXmlFragment('default');

// Transacción con origin 'ai-agent' para tracking
ydoc.transact(() => {
  // Aplicar ediciones AI al documento
}, 'ai-agent');

// Presencia: mostrar cursor AI
awareness.setLocalStateField('user', {
  name: 'AI Assistant',
  color: '#7c3aed', // Cursor morado
});
```

### 2.5 Track Changes para Ediciones AI

| Paquete | Licencia | Descripción |
|---------|----------|-------------|
| **`prosemirror-suggestion-mode`** | MIT | Google Docs-style suggestions. `applySuggestion()` diseñado para AI |
| **`@handlewithcare/prosemirror-suggest-changes`** | MIT | Similar, spin-off de NYTimes |

### 2.6 Tiptap AI Toolkit (opción de pago)

Si el presupuesto lo permite, **`@tiptap-pro/ai-toolkit`** ($39+/dev/mes) resuelve múltiples problemas de una vez:

- `toolkit.streamHtml(asyncIterable)` — streaming directo en el editor
- `toolkit.applyHtmlPatch(patches)` — diffs context-aware
- Review mode: `{ mode: 'review', diffMode: 'detailed' }` — aceptar/rechazar ediciones AI
- AI agent tools para Vercel AI SDK, Anthropic, OpenAI
- Compatible con Yjs — permite que otros usuarios editen mientras AI stream

**Requiere Tiptap 3.12.0+** y plan de suscripción activo.

---

## 3. Propuesta E: Stack MCP

### 3.1 MCP SDK

| Paquete | Versión | Rol |
|---------|---------|-----|
| **`@modelcontextprotocol/sdk`** | 1.26.0 (stable) | Core MCP server + client |
| **`@rekog/mcp-nest`** | — | Integración NestJS con decoradores `@Tool`, `@Resource` |
| **`zod`** | — | Schema validation (peer dependency) |

**Estado del SDK:** 11,600+ GitHub stars, 26,900+ dependientes en npm. SDK v2 anticipado para Q1 2026 (package split: `@modelcontextprotocol/core`, `@modelcontextprotocol/node`, `@modelcontextprotocol/express`, `@modelcontextprotocol/hono`).

### 3.2 NestJS + MCP con `@rekog/mcp-nest`

El paquete más maduro para integrar MCP en NestJS. Usa decoradores nativos y aprovecha la DI de NestJS.

```typescript
// app.module.ts
import { Module } from '@nestjs/common';
import { McpModule } from '@rekog/mcp-nest';
import { NotesMcpTool } from './notes-mcp.tool';

@Module({
  imports: [
    McpModule.forRoot({
      name: 'knowtis-mcp-server',
      version: '1.0.0',
    }),
  ],
  providers: [NotesMcpTool],
})
export class AppModule {}
```

```typescript
// notes-mcp.tool.ts
import { Injectable } from '@nestjs/common';
import { Tool, Context } from '@rekog/mcp-nest';
import { z } from 'zod';
import { NotesService } from '../notes/notes.service';

@Injectable()
export class NotesMcpTool {
  constructor(private readonly notesService: NotesService) {}

  @Tool({
    name: 'search-notes',
    description: 'Search notes by query',
    parameters: z.object({
      query: z.string(),
      limit: z.number().optional().default(10),
    }),
  })
  async searchNotes(
    { query, limit }: { query: string; limit: number },
    context: Context,
  ) {
    await context.reportProgress({ progress: 0, total: 100 });
    const results = await this.notesService.search(query, limit);
    await context.reportProgress({ progress: 100, total: 100 });
    return JSON.stringify(results);
  }

  @Tool({
    name: 'create-note',
    description: 'Create a new note',
    parameters: z.object({
      title: z.string(),
      content: z.string(),
    }),
  })
  async createNote({ title, content }: { title: string; content: string }) {
    const note = await this.notesService.create({ title, content });
    return JSON.stringify({ id: note.id, title: note.title });
  }

  @Tool({
    name: 'get-note',
    description: 'Get a note by ID',
    parameters: z.object({
      noteId: z.string().uuid(),
    }),
  })
  async getNote({ noteId }: { noteId: string }) {
    const note = await this.notesService.findById(noteId);
    return JSON.stringify(note);
  }
}
```

**Features de `@rekog/mcp-nest`:**
- Multi-transport: Streamable HTTP, HTTP+SSE, stdio
- Full NestJS DI: inyectar cualquier servicio existente
- Guard-based auth: JWT/API key via `CanActivate` guards
- Elicitation: tool calls que piden input del usuario
- OAuth 2.1 built-in con providers GitHub/Google
- Endpoints expuestos: `POST /mcp`, `GET /mcp`

### 3.3 Transports MCP

| Transport | Uso | Estado |
|-----------|-----|--------|
| **Streamable HTTP** | Producción, remoto | Standard actual (desde marzo 2025) |
| **stdio** | Local, CLI, Claude Desktop | Activo, el más común |
| **SSE (HTTP+SSE)** | Legacy | **Deprecado** (marzo 2025) |

**Streamable HTTP** usa un solo endpoint (ej. `POST /mcp`) que soporta respuestas JSON y SSE. Dos modos: stateful (con `Mcp-Session-Id`) y stateless.

### 3.4 Auth MCP

El framework de auth MCP se basa en **OAuth 2.1**:

- **MCP servers actúan como resource servers** — validan tokens de auth servers externos (Auth0, Keycloak, Cognito)
- **PKCE mandatorio** para Authorization Code flow
- **Client Credentials** para M2M (machine-to-machine)
- **Protected Resource Metadata** (RFC 9728) mandatorio
- **Incremental scope negotiation** — permisos otorgados solo cuando se necesitan

### 3.5 Clientes MCP que soportan Knowtis como servidor

| Cliente | Notas |
|---------|-------|
| **Claude Desktop** | Full MCP support, foundational client |
| **Claude Code** | Client AND Server — dual role |
| **VS Code (GitHub Copilot)** | Agent mode, `.vscode/mcp.json` config |
| **Cursor** | One-click setup, 40-tool limit |
| **ChatGPT (OpenAI)** | Adoptó MCP en marzo 2025 |
| **Gemini (Google)** | Confirmó soporte abril 2025 |
| **Vercel AI SDK** | `@ai-sdk/mcp` para consumir tools |
| **LangChain** | MCP tools integration |

### 3.6 MCP Ecosystem Update

- **MCP Registry** (preview, sept 2025) — catálogo machine-readable de servidores
- **AAIF (Agentic AI Foundation)** — Linux Foundation, dic 2025. Co-fundada por Anthropic, Block, OpenAI
- **MCP Bundles** (.mcpb) — archivos ZIP portables con server artifacts
- **Tasks** (nov 2025) — operaciones long-running con state machine

---

## 4. Base de Datos y Embeddings

### 4.1 pgvector

**Versión: 0.8.1** (requiere PostgreSQL 15+, Knowtis usa PG 16)

**No requiere paquete npm** — Drizzle ORM 0.31.0+ tiene soporte built-in para columnas `vector`.

```sql
-- Migration
CREATE EXTENSION IF NOT EXISTS vector;
```

```typescript
// Schema con Drizzle ORM
import { pgTable, text, vector, index, uuid, integer, varchar, timestamp } from 'drizzle-orm/pg-core';

export const noteEmbeddings = pgTable(
  'note_embeddings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    noteId: uuid('note_id').notNull(),
    chunkIndex: integer('chunk_index').notNull(),
    chunkContent: text('chunk_content').notNull(),
    embedding: vector('embedding', { dimensions: 1536 }),
    model: varchar('model', { length: 50 }).notNull(),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
  },
  (table) => ([
    index('idx_embedding_cosine').using(
      'hnsw',
      table.embedding.op('vector_cosine_ops'),
    ),
  ]),
);
```

```typescript
// Búsqueda semántica
import { cosineDistance, asc } from 'drizzle-orm';

async function findSimilarNotes(queryEmbedding: number[], limit = 5) {
  const distance = cosineDistance(noteEmbeddings.embedding, queryEmbedding);

  return db
    .select({
      id: noteEmbeddings.id,
      noteId: noteEmbeddings.noteId,
      content: noteEmbeddings.chunkContent,
      distance,
    })
    .from(noteEmbeddings)
    .orderBy(asc(distance))  // IMPORTANTE: usar asc(distance), NO desc(1-distance)
    .limit(limit);
}
```

**Performance tip:** Siempre ordenar por `asc(cosineDistance)` directamente. Usar `desc(1 - cosineDistance)` previene que PostgreSQL use el índice HNSW, causando queries de ~12s en vez de ~100ms en 2.8M rows.

### 4.2 Modelos de Embedding

| Modelo | Provider | Dimensiones | Precio/1M tokens | Recomendación |
|--------|----------|------------|-------------------|---------------|
| **`text-embedding-3-small`** | OpenAI | 1536 | $0.02 | **Empezar aquí** — barato, buena calidad |
| `text-embedding-3-large` | OpenAI | 3072 | $0.13 | Si se necesita más calidad |
| `voyage-3.5` | Voyage AI | 1024 | ~$0.06 | Partner oficial de Anthropic |
| `voyage-3.5-lite` | Voyage AI | 1024 | ~$0.02 | Rápido y económico |
| `embed-v4` | Cohere | variable | ~$0.10 | Líder MTEB, multilingüe |
| `BGE-M3` | BAAI | 1024 | Gratis (self-hosted) | Máxima privacidad |

**Nota:** Anthropic **no tiene** su propio modelo de embeddings. Recomiendan Voyage AI como partner.

### 4.3 Alternativas a pgvector (si se necesitan en el futuro)

| Base de Datos | Tipo | Mejor para |
|---------------|------|-----------|
| **Pinecone** | Managed cloud | Zero-ops, compliance (SOC2, HIPAA) |
| **Qdrant** | OSS + managed | Alto rendimiento, filtrado complejo |
| **Weaviate** | OSS + managed | GraphQL API, knowledge graphs |

**Recomendación:** pgvector con HNSW maneja millones de vectores. Migrar solo si se necesitan features especializadas.

---

## 5. Streaming: Patrones de Arquitectura

### 5.1 SSE vs WebSocket para AI Streaming

| Criterio | SSE | WebSocket / Socket.io |
|----------|-----|----------------------|
| Dirección | Unidireccional (server → client) | Bidireccional |
| Reconexión | Automática (EventSource) | Manual (Socket.io lo maneja) |
| Scaling | Stateless, horizontal fácil | Sticky sessions o broker |
| Debug | Fácil (HTTP) | Más difícil |

**Decisión para Knowtis: Socket.io.** Ya tenemos la infraestructura para Yjs. Agregar SSE sería una segunda conexión innecesaria.

### 5.2 Streaming AI via Socket.io (NestJS)

```typescript
import { WebSocketGateway, SubscribeMessage, ConnectedSocket, MessageBody } from '@nestjs/websockets';
import { Socket } from 'socket.io';
import { streamText } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';

@WebSocketGateway({ namespace: '/ai' })
export class AiGateway {

  @SubscribeMessage('ai:complete')
  async handleComplete(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { noteContent: string; action: string },
  ) {
    const result = streamText({
      model: anthropic('claude-sonnet-4-5-20250929'),
      messages: [
        { role: 'system', content: 'You are a writing assistant.' },
        { role: 'user', content: `${data.action}: ${data.noteContent}` },
      ],
    });

    for await (const chunk of result.textStream) {
      client.emit('ai:chunk', { text: chunk });
    }

    const usage = await result.usage;
    client.emit('ai:done', { usage });
  }
}
```

### 5.3 HTTP Endpoints (para operaciones no-streaming)

```typescript
import { Controller, Post, Res, Body } from '@nestjs/common';
import { streamText } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import type { Response } from 'express';

@Controller('api/v1/ai')
export class AiController {

  @Post('chat')
  async chat(@Body() body: { messages: any[] }, @Res() res: Response) {
    const result = streamText({
      model: anthropic('claude-sonnet-4-5-20250929'),
      messages: body.messages,
    });
    result.pipeTextStreamToResponse(res);
  }

  @Post('generate')
  async generate(@Body() body: { prompt: string }, @Res() res: Response) {
    const result = streamText({
      model: anthropic('claude-sonnet-4-5-20250929'),
      messages: [{ role: 'user', content: body.prompt }],
    });
    result.pipeUIMessageStreamToResponse(res);
  }
}
```

### 5.4 Best Practices de Streaming

1. **Typed events** — emitir `ai:chunk`, `ai:tool_call`, `ai:usage`, `ai:error`, `ai:done`
2. **Cancelación** — soportar `AbortController` para interrumpir mid-stream
3. **TTFT target** — < 300-700ms para UX responsivo
4. **Chunks pequeños** — no acumular tokens, enviar de a uno
5. **Backpressure** — no saturar el cliente con tokens más rápido de lo que puede renderizar

---

## 6. Rate Limiting y Costos

### 6.1 Conteo de Tokens

| Librería | Tipo | Uso |
|----------|------|-----|
| **`gpt-tokenizer`** | Pure JS, más rápido | Estimación client-side, rate limiting preventivo |
| `client.messages.countTokens()` | API Anthropic | Conteo exacto (server-side, pre-request) |

```typescript
// Client-side estimation
import { encode } from 'gpt-tokenizer';
const tokens = encode('Tu texto aquí');
console.log(tokens.length);

// Server-side exact (Anthropic)
const count = await anthropic.messages.countTokens({
  model: 'claude-sonnet-4-5-20250929',
  messages: [{ role: 'user', content: 'Tu texto' }],
  system: 'System prompt',
});
console.log(count.input_tokens);
```

### 6.2 Pricing de Modelos (Feb 2026)

| Modelo | Input/1M tokens | Output/1M tokens | Mejor para |
|--------|----------------|------------------|-----------|
| **Claude Haiku 4.5** | $0.80 | $4.00 | Ghost text, clasificación, tareas rápidas |
| **Claude Sonnet 4.5** | $3.00 | $15.00 | Resúmenes, expansión, chat contextual |
| GPT-4o-mini | $0.15 | $0.60 | Tareas ultra-económicas |
| GPT-4o | $2.50 | $10.00 | Fallback general |

### 6.3 Estrategia de Rate Limiting

```typescript
@Injectable()
export class AiRateLimitService {
  async checkLimit(userId: string, estimatedTokens: number): Promise<boolean> {
    const usage = await this.getUsage(userId);

    const DAILY_TOKEN_LIMIT = 100_000;
    const DAILY_COST_LIMIT = 1.00; // $1/día por usuario

    return usage.tokens + estimatedTokens <= DAILY_TOKEN_LIMIT
      && usage.cost <= DAILY_COST_LIMIT;
  }

  recordUsage(userId: string, inputTokens: number, outputTokens: number, model: string) {
    const pricing: Record<string, { input: number; output: number }> = {
      'claude-haiku-4-5': { input: 0.80 / 1_000_000, output: 4.00 / 1_000_000 },
      'claude-sonnet-4-5': { input: 3.00 / 1_000_000, output: 15.00 / 1_000_000 },
    };
    const p = pricing[model];
    const cost = inputTokens * p.input + outputTokens * p.output;
    // Persist usage...
  }
}
```

### 6.4 Optimización de Costos

| Técnica | Ahorro | Implementación |
|---------|--------|---------------|
| **Prompt caching** (Anthropic) | 90% en cache hits | `cache_control: { type: 'ephemeral' }` — TTL 5min |
| **Model routing** | 60-80% | Haiku para tareas simples, Sonnet para complejas |
| **Message Batches** | 50% | Background processing: indexación, bulk embeddings |
| **Truncar contexto** | Variable | Enviar solo contenido relevante, no la nota completa |

---

## 7. Tendencias y Best Practices 2025-2026

### 7.1 Structured Output (Obligatorio)

Siempre usar structured output sobre JSON plano:

```typescript
import { generateObject } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { z } from 'zod';

const { object } = await generateObject({
  model: anthropic('claude-sonnet-4-5-20250929'),
  schema: z.object({
    summary: z.string(),
    actionItems: z.array(z.object({
      task: z.string(),
      assignee: z.string().optional(),
      priority: z.enum(['high', 'medium', 'low']),
    })),
    keyTopics: z.array(z.string()),
  }),
  prompt: `Extract summary, action items, and key topics from: ${noteContent}`,
});
```

### 7.2 Tool Use Patterns

```typescript
import { streamText, tool } from 'ai';
import { z } from 'zod';

const result = streamText({
  model: anthropic('claude-sonnet-4-5-20250929'),
  tools: {
    searchNotes: tool({
      description: 'Search through user notes',
      parameters: z.object({ query: z.string() }),
      execute: async ({ query }) => notesService.search(query),
    }),
    getCurrentNote: tool({
      description: 'Get the content of the current note',
      parameters: z.object({}),
      execute: async () => editor.getText(),
    }),
  },
  messages: [{ role: 'user', content: 'Find related notes to what I am writing' }],
  maxSteps: 5, // Allow multi-step tool use
});
```

### 7.3 RAG Pipeline (para Búsqueda Semántica)

Pipeline recomendado de 3 etapas:

1. **BM25 keyword search** — captura matches exactos de tokens
2. **Dense vector retrieval** — encuentra similitud semántica (pgvector)
3. **Cross-encoder reranking** — optimiza el orden final

```bash
# Reranking (opcional, mejora retrieval hasta 48%)
pnpm add cohere-ai
```

```typescript
import { CohereClientV2 } from 'cohere-ai';

const cohere = new CohereClientV2({ token: process.env.COHERE_API_KEY });

const reranked = await cohere.rerank({
  model: 'rerank-v3.5',
  query: userQuery,
  documents: candidateDocuments,
  topN: 5,
});
```

### 7.4 Prompt Caching (Anthropic)

```typescript
import { streamText } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';

const result = streamText({
  model: anthropic('claude-sonnet-4-5-20250929'),
  messages: messages.map((msg, i) => ({
    ...msg,
    providerOptions:
      i === messages.length - 1
        ? { anthropic: { cacheControl: { type: 'ephemeral' } } }
        : undefined,
  })),
});
```

- **5-min TTL:** Write = 1.25x, Read = 0.1x del precio normal
- **1-hour TTL:** Write = 2x, Read = 0.1x
- Cachear: system prompts, tool definitions, conversación previa
- Mínimo 1,024 tokens por checkpoint

### 7.5 Batch API (Background Processing)

```typescript
// Ideal para: indexar notas, generar embeddings masivos, tagging
const batch = await anthropic.messages.batches.create({
  requests: notes.map((note, i) => ({
    custom_id: `note-${note.id}`,
    params: {
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 256,
      messages: [{ role: 'user', content: `Summarize: ${note.content}` }],
    },
  })),
});
// Hasta 10,000 requests, 50% descuento, resultados en <1 hora
```

---

## 8. Comando de Instalación

### Paquetes Esenciales (Propuesta A + E)

```bash
# Core AI SDK + Providers
pnpm add ai @ai-sdk/anthropic @ai-sdk/openai

# Anthropic SDK directo (caching, batches, token counting)
pnpm add @anthropic-ai/sdk

# MCP (Propuesta E)
pnpm add @modelcontextprotocol/sdk @rekog/mcp-nest

# Token counting (rate limiting)
pnpm add gpt-tokenizer

# Track changes en editor (Propuesta A)
pnpm add prosemirror-suggestion-mode
```

### Paquetes Opcionales

```bash
# Reranking para RAG avanzado
pnpm add cohere-ai

# Tiptap AI Toolkit (si el presupuesto lo permite, $39+/dev/mes)
# Requiere .npmrc con token de Tiptap Pro
pnpm add @tiptap-pro/ai-toolkit @tiptap-pro/ai-toolkit-ai-sdk

# MCP client SDK (si Knowtis también consume MCP servers)
pnpm add @ai-sdk/mcp
```

### Database Migration

```sql
-- Habilitar pgvector
CREATE EXTENSION IF NOT EXISTS vector;

-- Tabla de embeddings
CREATE TABLE note_embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  note_id UUID NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL,
  chunk_content TEXT NOT NULL,
  embedding vector(1536),
  model VARCHAR(50) NOT NULL DEFAULT 'text-embedding-3-small',
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);

CREATE INDEX idx_embedding_cosine
  ON note_embeddings USING hnsw (embedding vector_cosine_ops);

-- Tabla de uso AI
CREATE TABLE ai_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  action VARCHAR(50) NOT NULL,
  model VARCHAR(50) NOT NULL,
  input_tokens INTEGER DEFAULT 0,
  output_tokens INTEGER DEFAULT 0,
  cost_usd NUMERIC(10, 6) DEFAULT 0,
  created_at TIMESTAMP DEFAULT now()
);

CREATE INDEX idx_ai_usage_user_date ON ai_usage (user_id, created_at);
```

### Variables de Entorno

```bash
# apps/api/.env
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
AI_ENABLED=true
AI_DEFAULT_MODEL=claude-sonnet-4-5-20250929
AI_FAST_MODEL=claude-haiku-4-5-20251001
AI_DAILY_TOKEN_LIMIT=100000
AI_DAILY_COST_LIMIT=1.00

# Opcional
COHERE_API_KEY=...
VOYAGE_API_KEY=...
```

---

## Fuentes

- [Vercel AI SDK Docs](https://ai-sdk.dev/docs/introduction)
- [Vercel AI SDK NestJS Cookbook](https://ai-sdk.dev/cookbook/api-servers/nest)
- [AI SDK 6 Blog](https://vercel.com/blog/ai-sdk-6)
- [npm: @anthropic-ai/sdk](https://www.npmjs.com/package/@anthropic-ai/sdk)
- [Anthropic Prompt Caching](https://platform.claude.com/docs/en/build-with-claude/prompt-caching)
- [Anthropic Batch Processing](https://platform.claude.com/docs/en/build-with-claude/batch-processing)
- [Anthropic Tool Use](https://platform.claude.com/docs/en/agents-and-tools/tool-use/implement-tool-use)
- [Tiptap AI Toolkit](https://tiptap.dev/docs/content-ai/capabilities/ai-toolkit/overview)
- [Tiptap Suggestion Utility](https://tiptap.dev/docs/editor/api/utilities/suggestion)
- [Liveblocks: AI Copilot in Tiptap](https://liveblocks.io/blog/building-an-ai-copilot-inside-your-tiptap-text-editor)
- [prosemirror-suggestion-mode](https://github.com/davefowler/prosemirror-suggestion-mode)
- [Novel.sh — Tiptap + AI Reference](https://github.com/steven-tey/novel)
- [BlockNote AI](https://www.blocknotejs.org/docs/features/ai)
- [pgvector GitHub](https://github.com/pgvector/pgvector)
- [Drizzle pgvector Guide](https://orm.drizzle.team/docs/guides/vector-similarity-search)
- [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)
- [MCP Specification 2025-11-25](https://modelcontextprotocol.io/specification/2025-11-25)
- [@rekog/mcp-nest](https://github.com/rekog-labs/MCP-Nest)
- [MCP Auth Deep Dive](https://kane.mx/posts/2025/mcp-authorization-oauth-rfc-deep-dive/)
- [MCP Joins AAIF](http://blog.modelcontextprotocol.io/posts/2025-12-09-mcp-joins-agentic-ai-foundation/)
- [Claude Embeddings Docs](https://platform.claude.com/docs/en/build-with-claude/embeddings)
- [Yjs Discussion: AI LLM Streaming](https://discuss.yjs.dev/t/can-i-get-advice-on-how-to-work-with-streaming-ai-llms/2604)
