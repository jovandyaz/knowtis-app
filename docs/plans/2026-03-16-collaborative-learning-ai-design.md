# Collaborative Learning with AI — Design Plan

> **Goal**: Transform Knowtis from a collaborative notes app into a collaborative **learning** platform powered by AI.
>
> **Core UX philosophy**: The editor is the center. Every AI capability flows through it — no separate chat, no disconnected panels. "Smart Editor with Superpowers."
>
> **Date**: 2026-03-16
> **Estimated timeline**: ~12-15 weeks (3 phases)

---

## Table of Contents

1. [Vision](#vision)
2. [Phase 1: Artifacts + Smart Note Creation](#phase-1-artifacts--smart-note-creation-56-weeks)
3. [Phase 2: Embeddings + RAG + Note Intelligence](#phase-2-embeddings--rag--note-intelligence-34-weeks)
4. [Phase 3: External Source Ingestion](#phase-3-external-source-ingestion-45-weeks)
5. [Cost Analysis](#cost-analysis)
6. [Metrics](#metrics)

---

## Vision

```
Current:  Notes → Edit → Collaborate → Done
Future:   Any Input → Smart Note → Study (artifacts) → Connect (RAG) → Master
```

### The Problem

Students take notes, but the gap between **capturing information** and **converting it into knowledge** is massive. Today:

- Researching a topic means leaving the app (Google, ChatGPT, copy-paste)
- Notes sit idle after creation — no active learning tools
- No way to ask "what do I know about X?" across all your notes
- External materials (PDFs, articles) live outside the notes ecosystem

### The Solution: Smart Editor with Superpowers

Every AI capability lives inside the editor. The note is always the center:

```
Phase 1:  /learn JWT auth          → AI generates structured note
          /flashcards              → generates cards from current content
          /quiz                    → generates quiz from current content
          Paste long text          → offers to restructure/summarize

Phase 2:  While writing            → "3 related notes" appears contextually
          /ask what do I know?     → searches your notes, answers with citations

Phase 3:  Paste URL                → detects link, offers to digest into note
          Drop PDF                 → processes and generates structured note
          /from <url>              → imports and structures
```

---

## Phase 1: Artifacts + Smart Note Creation (~5-6 weeks)

### Overview

Build a unified artifact system and "smart note creation" — notes can be born from any input (topic, voice, pasted text) and can generate study artifacts (flashcards, quizzes, summaries, mind maps).

### 1.1 Artifact Framework (Backend) — ~4 days

#### New Database Schema

```sql
-- Unified artifact storage
CREATE TABLE artifacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type VARCHAR(50) NOT NULL,           -- 'flashcard_deck', 'quiz', 'summary', 'mind_map', 'outline'
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source_note_ids UUID[] NOT NULL,     -- notes used to generate this artifact
  title VARCHAR(255) NOT NULL,
  content JSONB NOT NULL,              -- type-specific structured content
  metadata JSONB DEFAULT '{}',         -- generation params, model used, etc.
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_artifacts_user ON artifacts(user_id);
CREATE INDEX idx_artifacts_type ON artifacts(user_id, type);

-- Flashcard-specific: spaced repetition state per user per card
CREATE TABLE flashcard_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  artifact_id UUID NOT NULL REFERENCES artifacts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  card_index INTEGER NOT NULL,         -- index within the deck's content array
  ease_factor NUMERIC(4,2) DEFAULT 2.5,
  interval_days INTEGER DEFAULT 0,
  repetitions INTEGER DEFAULT 0,
  next_review TIMESTAMPTZ DEFAULT NOW(),
  last_reviewed TIMESTAMPTZ,
  UNIQUE(artifact_id, user_id, card_index)
);

CREATE INDEX idx_flashcard_review ON flashcard_progress(user_id, next_review);

-- Quiz attempt tracking
CREATE TABLE quiz_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  artifact_id UUID NOT NULL REFERENCES artifacts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  score NUMERIC(5,2) NOT NULL,         -- percentage
  answers JSONB NOT NULL,              -- [{questionIndex, selectedIndex, correct}]
  completed_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### Artifact Content Schemas (Zod)

```typescript
// Flashcard deck content
const FlashcardDeckContent = z.object({
  cards: z.array(
    z.object({
      front: z.string(),
      back: z.string(),
      difficulty: z.enum(['easy', 'medium', 'hard']),
    })
  ),
});

// Quiz content
const QuizContent = z.object({
  questions: z.array(
    z.object({
      question: z.string(),
      options: z.array(z.string()).min(2).max(6),
      correctIndex: z.number(),
      explanation: z.string(),
    })
  ),
});

// Mind map content
const MindMapContent = z.object({
  root: z.string(),
  children: z.array(z.lazy(() => MindMapNode)),
});
const MindMapNode: z.ZodType = z.object({
  label: z.string(),
  children: z.array(z.lazy(() => MindMapNode)).optional(),
});

// Summary content
const SummaryContent = z.object({
  summary: z.string(), // HTML formatted
  keyPoints: z.array(z.string()),
  wordCount: z.number(),
});
```

#### Backend Architecture

```
modules/artifacts/
├── domain/
│   ├── value-objects/
│   │   └── artifact-type.vo.ts         # Enum + validation
│   ├── ports/
│   │   ├── artifact-generator.port.ts  # Interface for all generators
│   │   └── artifact-repository.port.ts # Persistence interface
│   └── errors/
│       └── artifact.errors.ts
├── application/
│   ├── commands/
│   │   ├── generate-artifact.handler.ts
│   │   └── regenerate-artifact.handler.ts
│   ├── queries/
│   │   ├── get-artifacts-by-note.handler.ts
│   │   ├── get-study-session.handler.ts  # Cards due for review
│   │   └── get-quiz-history.handler.ts
│   └── services/
│       └── spaced-repetition.service.ts  # SM-2 algorithm
├── infrastructure/
│   ├── generators/
│   │   ├── flashcard.generator.ts        # generateObject → FlashcardDeckContent
│   │   ├── quiz.generator.ts             # generateObject → QuizContent
│   │   ├── mind-map.generator.ts         # generateObject → MindMapContent
│   │   ├── summary.generator.ts          # generateText → SummaryContent
│   │   └── outline.generator.ts          # generateText → string
│   └── persistence/
│       └── drizzle-artifact.repository.ts
├── artifact.controller.ts
└── artifact.module.ts
```

### 1.2 Simple Artifacts (Summary, Outline, Mind Map) — ~3 days

These reuse the existing AI pipeline (`generateObject`/`generateText`):

| Artifact | Method           | Model  | Output                           |
| -------- | ---------------- | ------ | -------------------------------- |
| Summary  | `generateText`   | Sonnet | HTML + key points                |
| Outline  | `generateText`   | Sonnet | Structured HTML                  |
| Mind Map | `generateObject` | Sonnet | JSON tree → rendered in frontend |

#### API Endpoints

```
POST   /api/v1/artifacts/generate    { type, noteIds[] }
GET    /api/v1/artifacts?noteId=X    List artifacts for a note
GET    /api/v1/artifacts/:id         Get artifact detail
DELETE /api/v1/artifacts/:id         Delete artifact
```

### 1.3 Flashcards + Quiz with Spaced Repetition — ~2 weeks

#### SM-2 Algorithm Implementation

```typescript
interface SM2Input {
  quality: number; // 0-5 (0=forgot, 5=perfect)
  repetitions: number;
  easeFactor: number;
  intervalDays: number;
}

interface SM2Output {
  repetitions: number;
  easeFactor: number;
  intervalDays: number;
  nextReview: Date;
}
```

Standard SM-2 with these review quality mappings:

- **0-1**: Complete blackout → reset to 0
- **2**: Wrong but recognized → reset to 0
- **3**: Correct with difficulty → maintain interval
- **4**: Correct with hesitation → increase interval
- **5**: Perfect recall → increase interval significantly

#### Additional API Endpoints

```
GET    /api/v1/artifacts/:id/study-session     Cards due for review
POST   /api/v1/artifacts/:id/review            Submit card review { cardIndex, quality }
GET    /api/v1/artifacts/:id/quiz-attempts      Quiz history
POST   /api/v1/artifacts/:id/quiz-attempt       Submit quiz attempt { answers[] }
GET    /api/v1/artifacts/stats                  Study stats (streak, cards reviewed, etc.)
```

#### Frontend Components

```
components/artifacts/
├── ArtifactGenerator.tsx        # "Generate from note" button + type selector
├── ArtifactViewer.tsx           # Switch by type → render correct component
├── FlashcardStudy.tsx           # Flip card UI with swipe gestures (mobile)
├── FlashcardCard.tsx            # Single card with flip animation
├── QuizSession.tsx              # Interactive quiz with progress bar
├── QuizResults.tsx              # Score, correct/wrong breakdown
├── MindMapViewer.tsx            # Interactive tree visualization
├── SummaryViewer.tsx            # Formatted summary with key points
├── StudyStats.tsx               # Streak, cards due, progress chart
└── ArtifactList.tsx             # Grid of artifacts for a note
```

### 1.4 Smart Note Creation — ~5 days

#### `/learn` Command (Generate from Topic) — ~3 days

New slash command in the editor:

```
User types: /learn JWT authentication
```

**Flow:**

1. Editor recognizes `/learn` command
2. Shows loading state with typewriter effect (reuse existing ghost-text UX)
3. Backend: `POST /api/v1/ai/learn` with `{ topic: "JWT authentication" }`
4. AI generates structured note (title + HTML content with headers, explanations, examples)
5. Content inserted at cursor position or replaces entire note if empty

**System prompt focus:**

- Generate educational content structured for learning
- Include: concept explanation, key points, practical examples, common pitfalls
- Use headers (H2, H3) for scannable structure
- Output is HTML compatible with Tiptap

#### Smart Paste (Restructure Pasted Content) — ~2 days

**Flow:**

1. User pastes >500 characters of text
2. Editor detects long paste event
3. Shows toast/popover: "Restructure this content?" with options:
   - "Summarize" → condense into key points
   - "Structure" → add headers, lists, organization
   - "Keep as-is" → normal paste
4. If user chooses an action → processes via existing AI pipeline
5. Result replaces the pasted content

**Implementation:** Tiptap `onPaste` extension that checks content length and shows action popover.

### 1.5 Collaborative Artifact Sharing

Artifacts inherit permissions from their source note:

- If you can view the note → you can view its artifacts
- If you can edit the note → you can generate new artifacts
- Flashcard progress is **per-user** (each collaborator has their own spaced repetition state)
- Quiz attempts are **per-user** (each sees their own score history)
- Collaborative view: "Your team's study progress" — aggregated stats

---

## Phase 2: Embeddings + RAG + Note Intelligence (~3-4 weeks)

### Overview

Add semantic understanding of notes via embeddings, enabling semantic search, Q&A with citations, and contextual "Note Intelligence" suggestions.

### 2.1 pgvector + Embeddings Pipeline — ~4 days

#### Infrastructure

```sql
-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Note chunks with embeddings
CREATE TABLE note_embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  note_id UUID NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL,
  content TEXT NOT NULL,                    -- plain text chunk
  embedding vector(1024) NOT NULL,          -- Voyage 3 outputs 1024 dimensions
  token_count INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(note_id, chunk_index)
);

-- HNSW index for fast similarity search
CREATE INDEX idx_note_embeddings_vector
  ON note_embeddings USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- Track embedding freshness
ALTER TABLE notes ADD COLUMN embedding_updated_at TIMESTAMPTZ;
```

#### Embedding Provider

```typescript
// Voyage AI (recommended: best price/quality for RAG)
// Model: voyage-3 (1024 dimensions, $0.06/M tokens)
// Alternative: OpenAI text-embedding-3-small (1536 dim, $0.02/M tokens)

interface EmbeddingProvider {
  embed(texts: string[]): Promise<number[][]>;
  readonly dimensions: number;
  readonly model: string;
}
```

#### Chunking Strategy

```typescript
// Split notes into chunks for embedding
// Strategy: paragraph-based with overlap
interface ChunkConfig {
  maxTokens: 512; // Max tokens per chunk
  overlapTokens: 50; // Overlap between chunks for context continuity
  minTokens: 20; // Skip very short chunks
  splitOn: 'paragraph'; // Split on double newline / <p> boundaries
}
```

#### Auto-Embedding Pipeline

```
Note saved (create/update)
    ↓
Debounce (30 seconds — avoid re-embedding on every keystroke)
    ↓
Check: has content changed since last embedding? (compare updated_at vs embedding_updated_at)
    ↓ yes
Strip HTML → plain text
    ↓
Chunk text (paragraph-based, max 512 tokens)
    ↓
Batch embed via Voyage API
    ↓
Upsert note_embeddings (delete old chunks, insert new)
    ↓
Update notes.embedding_updated_at
```

**Processing:** Async via BullMQ job queue (Redis-backed, already available).

### 2.2 Semantic Search — ~3 days

Upgrade existing search (currently text-based) with semantic fallback:

```
User searches "how authentication works"
    ↓
1. Full-text search (existing, fast, exact matches)
2. Semantic search (embed query → cosine similarity → top-K)
3. Merge & deduplicate results
4. Return ranked results with relevance snippets
```

#### API

```
GET /api/v1/notes/search?q=how+auth+works&mode=semantic
```

Response includes `relevanceScore` and `matchSnippet` for each result.

#### Permission-Aware Search

The semantic search must only return notes the user owns or has been shared with:

```sql
SELECT ne.note_id, ne.content, 1 - (ne.embedding <=> $1) AS similarity
FROM note_embeddings ne
JOIN notes n ON n.id = ne.note_id
LEFT JOIN note_permissions np ON np.note_id = n.id AND np.user_id = $2
WHERE (n.owner_id = $2 OR np.user_id IS NOT NULL OR n.general_access != 'restricted')
  AND 1 - (ne.embedding <=> $1) > 0.3    -- similarity threshold
ORDER BY similarity DESC
LIMIT 10;
```

### 2.3 RAG: Q&A Over Notes — ~5 days

#### Flow

```
User: /ask What design patterns have I documented?
    ↓
1. Embed the question
2. Retrieve top-K relevant chunks (cosine similarity, permission-filtered)
3. Build prompt: system prompt + retrieved chunks with note titles + user question
4. Claude generates answer with citations [Note: "title"]
5. Response inserted inline in the editor (or shown in a result panel)
```

#### System Prompt for RAG

```
You are a study assistant. Answer the user's question based ONLY on their notes.
For each claim, cite the source note using [Note: "title"] format.
If the notes don't contain enough information, say so honestly.
Do not make up information not present in the notes.
```

#### API

```
POST /api/v1/ai/ask
{
  "question": "What design patterns have I documented?",
  "noteIds": []           // empty = search all user's notes
}

Response (streamed via WebSocket):
{
  "answer": "Based on your notes, you've documented...",
  "citations": [
    { "noteId": "uuid", "title": "DDD Patterns", "snippet": "..." },
    { "noteId": "uuid", "title": "SOLID Principles", "snippet": "..." }
  ]
}
```

### 2.4 Note Intelligence (Contextual Suggestions) — ~3 days

Passive, contextual AI layer that appears while editing:

#### Triggers

| Trigger                          | What appears                       | How                                        |
| -------------------------------- | ---------------------------------- | ------------------------------------------ |
| User writes >200 words           | "3 related notes" floating pill    | Embed current content → find similar notes |
| User hasn't edited in 10s        | "Suggested connections" subtle bar | Same as above, but more detailed           |
| Content contradicts another note | "Possible conflict with [Note]"    | Semantic similarity + LLM verification     |

#### Implementation

- **Lightweight:** Only triggers on idle (debounced 10s after last edit)
- **Non-intrusive:** Small floating pill at top-right of editor, expandable on click
- **Cached:** Results cached per note content hash, invalidated on edit
- **Optional:** User can disable in settings

#### Frontend Components

```
components/note-intelligence/
├── NoteIntelligenceProvider.tsx    # Context that manages trigger logic
├── RelatedNotesPill.tsx            # "3 related notes" floating indicator
├── RelatedNotesPanel.tsx           # Expanded view with note previews
└── ConnectionSuggestion.tsx        # Individual suggestion card
```

---

## Phase 3: External Source Ingestion (~4-5 weeks)

### Overview

Allow users to bring external knowledge (PDFs, URLs, videos) into the Knowtis ecosystem. Sources are parsed, chunked, embedded, and available for RAG alongside notes.

### 3.1 File Storage + Upload — ~3 days

#### Storage

Cloudflare R2 (S3-compatible, free egress):

```
Bucket: knowtis-sources
Structure: /{userId}/{sourceId}/{original_filename}
```

#### Database Schema

```sql
CREATE TABLE sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  note_id UUID REFERENCES notes(id) ON DELETE SET NULL,  -- optional: attached to a note
  type VARCHAR(20) NOT NULL,            -- 'pdf', 'url', 'text', 'youtube'
  title VARCHAR(255) NOT NULL,
  original_url TEXT,                     -- for URL/YouTube sources
  file_key TEXT,                         -- R2 object key (for uploaded files)
  file_size_bytes INTEGER,
  status VARCHAR(20) DEFAULT 'pending',  -- 'pending', 'processing', 'ready', 'error'
  error_message TEXT,
  metadata JSONB DEFAULT '{}',           -- page count, word count, etc.
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE source_embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL,
  content TEXT NOT NULL,
  embedding vector(1024) NOT NULL,
  page_number INTEGER,                   -- for PDFs: which page
  token_count INTEGER NOT NULL,
  UNIQUE(source_id, chunk_index)
);

CREATE INDEX idx_source_embeddings_vector
  ON source_embeddings USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);
```

### 3.2 Parsing Pipeline — ~5 days

#### Supported Source Types

| Type     | Parser                  | Library                                       |
| -------- | ----------------------- | --------------------------------------------- |
| PDF      | Extract text per page   | `pdf-parse` or `@xenova/transformers` (local) |
| URL      | Extract article content | `@mozilla/readability` + `cheerio`            |
| YouTube  | Fetch transcript        | `youtube-transcript` API                      |
| Raw text | Direct chunking         | Built-in                                      |

#### Processing Flow (BullMQ Job)

```
Source uploaded/submitted
    ↓
Job enqueued: 'source:process'
    ↓
1. Parse: Extract text from source (type-specific parser)
2. Clean: Remove headers/footers/nav, normalize whitespace
3. Chunk: Split into 512-token chunks with 50-token overlap
4. Embed: Batch embed all chunks via Voyage API
5. Store: Insert source_embeddings rows
6. Update: source.status = 'ready'
    ↓
Notify user via WebSocket: "Your PDF is ready"
```

### 3.3 Unified RAG — ~4 days

Extend the Phase 2 RAG to search both notes AND sources:

```sql
-- Combined search: notes + sources (permission-aware)
(
  SELECT 'note' AS source_type, ne.note_id AS ref_id, n.title, ne.content,
         1 - (ne.embedding <=> $1) AS similarity
  FROM note_embeddings ne
  JOIN notes n ON n.id = ne.note_id
  WHERE (n.owner_id = $2 OR ...) AND 1 - (ne.embedding <=> $1) > 0.3
)
UNION ALL
(
  SELECT 'source' AS source_type, se.source_id AS ref_id, s.title, se.content,
         1 - (se.embedding <=> $1) AS similarity
  FROM source_embeddings se
  JOIN sources s ON s.id = se.source_id
  WHERE s.user_id = $2 AND s.status = 'ready' AND 1 - (se.embedding <=> $1) > 0.3
)
ORDER BY similarity DESC
LIMIT 10;
```

Citations now distinguish:

- `[Note: "JWT Auth Patterns"]` — links to internal note
- `[PDF: "Clean Architecture.pdf", p.42]` — links to source with page reference
- `[URL: "mozilla.org/..."]` — links to original URL

### 3.4 Smart Editor Integration — ~5 days

#### URL Detection on Paste

```typescript
// Tiptap extension: detect URL paste
editor.on('paste', ({ event }) => {
  const text = event.clipboardData?.getData('text/plain');
  const urlMatch = text?.match(/^https?:\/\/\S+$/);
  if (urlMatch) {
    showPopover({
      options: [
        'Import as source (digest content)',
        'Insert as link',
        'Cancel',
      ],
    });
  }
});
```

#### PDF Drag & Drop

```typescript
// Tiptap extension: detect file drop
editor.on('drop', ({ event }) => {
  const file = event.dataTransfer?.files[0];
  if (file?.type === 'application/pdf') {
    uploadAndProcess(file);
    showProcessingIndicator();
  }
});
```

#### `/from` Slash Command

```
/from https://developer.mozilla.org/en-US/docs/Web/HTTP/Cookies
```

Fetches URL → parses → generates structured note from content → inserts at cursor.

### 3.5 Frontend Components

```
components/sources/
├── SourceUploader.tsx           # Drag & drop zone + URL input
├── SourceList.tsx               # Sources attached to a note
├── SourceCard.tsx               # Status indicator (processing/ready/error)
├── SourcePreview.tsx            # Preview extracted content
├── ProcessingIndicator.tsx      # Progress: parsing → embedding → ready
└── PasteUrlPopover.tsx          # "Import as source?" popover on URL paste
```

---

## Cost Analysis

### AI Cost Per Operation

| Operation                     | Model           | Input tokens | Output tokens | Cost USD  |
| ----------------------------- | --------------- | ------------ | ------------- | --------- |
| Generate 15 flashcards        | Haiku           | ~2,000       | ~1,500        | ~$0.008   |
| Generate quiz (10 questions)  | Sonnet          | ~2,000       | ~2,000        | ~$0.036   |
| Generate mind map             | Sonnet          | ~2,000       | ~1,000        | ~$0.021   |
| Generate summary              | Sonnet          | ~2,000       | ~500          | ~$0.014   |
| `/learn` topic generation     | Sonnet          | ~500         | ~2,000        | ~$0.032   |
| Embed one note (~1K tokens)   | Voyage 3        | ~1,000       | —             | ~$0.00006 |
| Embed 100 notes               | Voyage 3        | ~100,000     | —             | ~$0.006   |
| RAG query (retrieve + answer) | Voyage + Sonnet | ~3,000       | ~500          | ~$0.017   |
| Ingest 1 PDF (20 pages)       | Voyage 3        | ~15,000      | —             | ~$0.0009  |
| Ingest 1 URL                  | Voyage 3        | ~5,000       | —             | ~$0.0003  |

### Monthly Cost Per User Profile

| Profile                                                 | Operations/month | AI cost/month |
| ------------------------------------------------------- | ---------------- | ------------- |
| Casual student (5 notes, 2 quizzes, 5 RAG queries)      | ~12              | ~$0.10        |
| Active student (20 notes, 10 decks, 20 queries, 5 PDFs) | ~55              | ~$0.45        |
| Power user (50 notes, 30 decks, 50 queries, 20 PDFs)    | ~150             | ~$1.50        |

### Infrastructure Cost (Monthly)

| Component                       | Phase | Cost                      |
| ------------------------------- | ----- | ------------------------- |
| pgvector (PostgreSQL extension) | 2     | $0 (free extension)       |
| Voyage AI embeddings            | 2     | ~$1-5 (depends on volume) |
| Cloudflare R2 storage           | 3     | ~$1-5 (first 10GB free)   |
| BullMQ (uses existing Redis)    | 3     | $0                        |

### Total Estimated Monthly Cost (100 Active Users)

| Phase           | Users AI cost | Infra cost | Total   |
| --------------- | ------------- | ---------- | ------- |
| Phase 1 only    | ~$10-25       | $0         | ~$10-25 |
| Phase 1 + 2     | ~$15-40       | ~$1-5      | ~$16-45 |
| Phase 1 + 2 + 3 | ~$20-55       | ~$2-10     | ~$22-65 |

---

## Metrics

### Success Metrics Per Phase

#### Phase 1: Artifacts

- **Retention**: % users returning daily for spaced repetition reviews
- **Adoption**: artifacts generated per active user per week
- **Engagement**: average study session duration
- **Target**: 30% of active users generate at least 1 artifact/week

#### Phase 2: RAG

- **Utility**: RAG queries per user per week
- **Quality**: % of RAG answers rated useful (thumbs up/down)
- **Discovery**: notes discovered via semantic search that weren't found via text search
- **Target**: 20% of active users use /ask at least once/week

#### Phase 3: Ingestion

- **Adoption**: sources uploaded per user per week
- **Completion**: % of sources successfully processed
- **Cross-reference**: % of RAG queries that cite both notes and sources
- **Target**: 15% of active users upload at least 1 source/week

### North Star Metric

**Weekly Active Learners (WAL)**: Users who performed at least one learning action (study flashcards, take quiz, ask RAG question, generate artifact) in the past 7 days.

---

## Technical Risks & Mitigations

| Risk                           | Impact | Mitigation                                                          |
| ------------------------------ | ------ | ------------------------------------------------------------------- |
| pgvector performance at scale  | Medium | HNSW index, partition by user if needed                             |
| Embedding costs spike          | Low    | Batch processing, skip unchanged notes, cache aggressively          |
| PDF parsing quality varies     | Medium | Multiple parsers, fallback chain, allow user to edit extracted text |
| LLM hallucination in RAG       | High   | Strict system prompt ("only cite from notes"), show source snippets |
| Flashcard quality varies       | Medium | Allow user to edit generated cards, thumbs up/down feedback         |
| YouTube transcript unavailable | Low    | Graceful error, suggest manual paste                                |

---

## Implementation Order Summary

```
Week 1-2:   Artifact framework + simple artifacts (summary, outline, mind map)
Week 3-4:   Flashcard generation + SM-2 spaced repetition
Week 5-6:   Quiz generation + /learn command + smart paste + frontend polish
            ── Phase 1 complete ──
Week 7-8:   pgvector setup + embedding pipeline + auto-embed on note save
Week 9:     Semantic search + RAG Q&A with citations
Week 10:    Note Intelligence (contextual suggestions) + frontend
            ── Phase 2 complete ──
Week 11-12: File storage + parsing pipeline (PDF, URL, YouTube)
Week 13:    Unified RAG (notes + sources) + smart editor integration
Week 14-15: Frontend polish + drag-drop + /from command + testing
            ── Phase 3 complete ──
```

Each phase delivers independently usable value. No phase is wasted if a later phase is delayed.
