# Voice-to-Note

## Overview

Voice-to-Note lets users record spoken audio, transcribe it via OpenAI Whisper, and structure the result into a formatted note using Claude. Available in two modes: **create** (new note from voice) and **insert** (inject text into an existing note at cursor position). Gated by `ai_enabled` + `voice_notes_enabled` DB feature flags.

| Layer         | Technology                                                                              |
| ------------- | --------------------------------------------------------------------------------------- |
| Recording     | MediaRecorder API, Web Audio API (AnalyserNode for waveform)                            |
| Live preview  | Web Speech API (SpeechRecognition, browser-side, no cost)                               |
| Transcription | OpenAI Whisper (`whisper-1`) via Vercel AI SDK                                          |
| Structuring   | Anthropic Claude via `generateStructuredOutput` (`generateText` + `Output.object`, Zod) |
| Frontend      | React 19, Zustand, TanStack Query/Router                                                |
| Design system | `@knowtis/design-system` (VoiceButton, RecordingModal, etc.)                            |

---

## Architecture

### Backend

```
apps/api/src/modules/ai/
├── ai.controller.ts                         # POST /ai/voice-note endpoint
├── dto/voice-note.dto.ts                    # Request validation (mode, language)
├── domain/schemas/voice-note.schema.ts      # Zod schema for Claude's structured output
├── application/
│   ├── commands/voice-note.handler.ts       # Orchestrates transcription → structuring
│   └── services/voice-transcription.service.ts  # Whisper transcription wrapper
```

### Frontend

```
apps/notes/src/
├── hooks/
│   ├── useVoiceRecorder.ts      # MediaRecorder + Web Speech API + AudioContext
│   └── useVoiceNote.ts          # TanStack Query mutation for POST /ai/voice-note
├── components/voice-note/
│   ├── VoiceNoteRecorder.tsx    # Main orchestrator component (recording → processing → result)
│   ├── VoiceNoteResult.tsx      # Preview + action buttons (Discard, Retry, Create/Insert)
│   ├── LivePreview.tsx          # Real-time transcript display (Web Speech API)
│   └── index.ts
├── stores/
│   └── voice-note-editor.store.ts   # Zustand bridge for slash command → RecordingModal

packages/design-system/src/components/
├── VoiceButton.tsx              # FAB trigger button (idle/listening/paused/processing/disabled states)
├── RecordingModal.tsx           # Radix Dialog — centered on desktop, bottom sheet on mobile
├── RecordingTimer.tsx           # Elapsed/max timer with Radix Progress bar
└── AudioWaveform.tsx            # Canvas-based frequency visualization
```

### Dependency Flow

```
VoiceNoteRecorder
  → useVoiceRecorder (MediaRecorder + AudioContext + SpeechRecognition)
  → useVoiceNote (TanStack Query mutation)
      → httpClient.post('/ai/voice-note', FormData)
  → useCreateNote (TanStack Query mutation, create mode only)

Backend:
POST /ai/voice-note (multipart/form-data)
  → VoiceNoteHandler.execute()
      → AIRateLimitService.checkLimit()
      → VoiceTranscriptionService.transcribe()    # Whisper
      → AIOrchestrator.selectModel() + getSystemPrompt()
      → generateStructuredOutput(voiceNoteOutputSchema)  # Claude (generateText + Output.object)
      → AIRateLimitService.recordUsage()           # Whisper + Claude costs
```

---

## Request Flow

```
1. User taps VoiceButton (FAB) or selects /voice slash command
2. Browser requests microphone permission (getUserMedia)
3. MediaRecorder captures audio chunks (WebM or MP4)
4. AudioContext → AnalyserNode feeds real-time waveform to canvas
5. Web Speech API provides live transcript preview (browser-side, no API cost)
6. User taps Stop → MediaRecorder produces Blob
7. POST /ai/voice-note (FormData: audio blob + mode + language)
      ├─ Rate limit check (estimated tokens from audio size)
      ├─ Whisper transcription → raw text
      ├─ Claude generateStructuredOutput → { title, content } (structured HTML)
      └─ Usage recording (Whisper cost + Claude tokens)
8. Frontend displays VoiceNoteResult with title + HTML preview
9. User taps Create note → creates note and navigates to editor
   OR taps Insert → content injected at cursor position
```

---

## API Endpoint

### `POST /api/v1/ai/voice-note`

Multipart/form-data. Requires `JwtAuthGuard` + feature flags `ai_enabled` and `voice_notes_enabled`.

| Field      | Type   | Required | Description                                                  |
| ---------- | ------ | -------- | ------------------------------------------------------------ |
| `audio`    | file   | Yes      | Audio file (max 10 MB, MIME `audio/*`)                       |
| `mode`     | string | Yes      | `'create-note'` or `'insert'`                                |
| `language` | string | No       | ISO-639-1 code (e.g. `'en'`, `'es'`). Auto-detect if omitted |

**Response (200):**

```json
{
  "title": "Meeting Notes",
  "content": "<h2>Key Points</h2><ul><li>...</li></ul>",
  "transcript": "So in today's meeting we discussed..."
}
```

**Error codes:** Same as the AI module — `AI_RATE_LIMIT_EXCEEDED`, `AI_PROVIDER_ERROR`, `AI_INVALID_INPUT`, etc.

**Structured output schema** (`voice-note.schema.ts`):

| Field     | Type   | Constraint | Description                                                |
| --------- | ------ | ---------- | ---------------------------------------------------------- |
| `title`   | string | max 50     | Short descriptive title, 3-8 words                         |
| `content` | string | —          | HTML with `<h2>`, `<ul>/<li>`, `<ol>`, checkbox task items |

If Claude structuring fails, the handler falls back to a plain `<p>` wrapping the raw transcript with a truncated title.

---

## Frontend Components

### `useVoiceRecorder` Hook

Core recording hook managing MediaRecorder, AudioContext, and Web Speech API.

| State       | Description                               |
| ----------- | ----------------------------------------- |
| `idle`      | No recording active                       |
| `recording` | Actively capturing audio                  |
| `paused`    | Recording paused (MediaRecorder.pause)    |
| `stopped`   | Recording finished, `audioBlob` available |

**Key features:**

- **Pre-acquired stream**: Accepts an optional `preAcquiredStream` parameter to reuse a `MediaStream` obtained from a prior user gesture (avoids double permission prompt in insert mode)
- **MIME negotiation**: Tries `audio/webm` first, falls back to `audio/mp4` (Safari), then browser default
- **Max duration**: Configurable (default 300s), auto-stops when reached
- **Live transcript**: Web Speech API with auto-restart on silence detection (continuous mode)
- **Waveform data**: Exposes `AnalyserNode` for real-time frequency visualization
- **Strict Mode safe**: Guards against concurrent `start()` calls via `startingRef`

### `VoiceNoteRecorder` Component

Orchestrates the full voice-to-note flow. Operates in two modes:

| Mode     | Trigger                        | Result action                          |
| -------- | ------------------------------ | -------------------------------------- |
| `create` | VoiceButton FAB click          | Creates new note + navigates to editor |
| `insert` | Slash command or editor button | Calls `onInsert(content)` callback     |

**Flow states:** `idle → recording → processing → result` (or `error` with retry)

### Design System Components

| Component        | Description                                                                                                                                        |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `VoiceButton`    | FAB with CVA variants for state (`idle`, `listening`, `paused`, `processing`, `disabled`) and size (`sm`, `default`, `lg`, `xl`)                   |
| `RecordingModal` | Radix Dialog with responsive layout: centered dialog on desktop (`md:`), bottom sheet on mobile (`max-md:`) with drag handle and safe-area padding |
| `RecordingTimer` | Radix Progress bar with `mm:ss` display, red warning at 30s remaining                                                                              |
| `AudioWaveform`  | Canvas-based bar visualization. Uses lower 30% of frequency bins (voice range ~85Hz–3kHz). DPR-aware rendering with ResizeObserver                 |

---

## Mobile UX

### Bottom Sheet Pattern

`RecordingModal` and the general `Dialog` component share a responsive bottom sheet pattern:

- **Desktop (`md:`)**: Centered dialog with zoom-in animation
- **Mobile (`max-md:`)**: Anchored to bottom, full-width, rounded top corners, slide-from-bottom animation, drag handle indicator, `env(safe-area-inset-bottom)` padding

### Editor Toolbar

On mobile, the toolbar is optimized for touch:

- Undo/Redo buttons hidden (`hideOnMobile: true` in `editor.config.ts`)
- Separators hidden (`max-md:hidden`)
- Voice note mic button with primary color accent (visible only on mobile via `md:hidden`)
- Toolbar floated above bottom edge (`max-md:bottom-3`) to avoid accidental taps

### Navigation

- Mobile back button: `FloatingActionButton` with `ArrowLeft` icon in top-left corner
- Mobile share button: `FloatingActionButton` in top-right corner (when user has share permission)

---

## Modes of Access

### 1. Notes List — Create Mode

`VoiceNoteRecorder` rendered in `NoteList.tsx` (desktop header) and `FloatingCreateButton.tsx` (mobile FAB). Tapping the mic opens the recording modal; on result, creates a new note and navigates to the editor.

### 2. Editor Toolbar — Insert Mode (mobile)

Mic button in `EditorToolbar` triggers `VoiceNoteRecorder` in insert mode. The result content is inserted at cursor position via TipTap `insertContent()`.

### 3. Slash Command — Insert Mode

Typing `/voice` or `/voz` in the editor opens the slash command menu with "Voice note" option. Uses `useVoiceNoteEditorStore` (Zustand) as a bridge between the slash command action (pure function) and the React `VoiceNoteRecorder` component.

---

## Configuration

### Feature Flags (DB-backed)

| Flag Key              | Description                |
| --------------------- | -------------------------- |
| `ai_enabled`          | Global AI feature gate     |
| `voice_notes_enabled` | Voice-to-note feature gate |

### Environment Variables

| Variable            | Required | Description                                           |
| ------------------- | -------- | ----------------------------------------------------- |
| `OPENAI_API_KEY`    | No       | OpenAI API key (Whisper, validated at runtime)        |
| `ANTHROPIC_API_KEY` | No       | Anthropic API key (structuring, validated at runtime) |

---

## Cost Tracking

Both Whisper and Claude costs are tracked in the `ai_usage` table via `AIRateLimitService.recordUsage()`:

| Step          | Action constant        | Model              | Cost basis                                     |
| ------------- | ---------------------- | ------------------ | ---------------------------------------------- |
| Transcription | `voice-transcription`  | `openai:whisper-1` | $0.006/min, estimated from file size (~12KB/s) |
| Structuring   | `structure-voice-note` | Claude (default)   | Standard token pricing                         |

Rate limiting checks estimated token count from audio size before processing (rough: ~25 tokens/second of speech at ~12KB/s bitrate).
