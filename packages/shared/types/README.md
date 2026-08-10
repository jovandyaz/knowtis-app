# @knowtis/shared-types

The canonical shared FE/BE contract — domain types and constants used across the entire monorepo. With ~120 consumers it is the single most-imported workspace package. It has **zero workspace dependencies** so it can be safely imported from any project (apps, libs, packages).

Import via the `@knowtis/shared-types` alias (`tsconfig.base.json`):

```ts
import {
  PERMISSION,
  type CreateNoteInput,
  type Note,
} from '@knowtis/shared-types';
```

> **Rule:** import shared types from `@knowtis/shared-types` — never redefine a domain type locally. One definition, one source of truth.

## Domains

Each domain lives in its own `src/lib/*.types.ts`:

| File                     | Covers                                                                |
| ------------------------ | --------------------------------------------------------------------- |
| `user.types.ts`          | `User`, `UserProfile`, `CreateUserInput`, `UpdateUserInput`           |
| `note.types.ts`          | `Note`, `NoteWithOwner`, create/update/share inputs, permission types |
| `collaboration.types.ts` | Realtime collab events and Socket.io payloads                         |
| `ai.types.ts`            | AI actions, languages, tones, model tiers, BYOK providers/secrets     |
| `artifact.types.ts`      | Flashcards, quizzes, summaries, mind maps, SM-2 study progress        |
| `feature-flags.types.ts` | Feature flag keys and DTO                                             |
| `anonymous.types.ts`     | Anonymous-user limits                                                 |
| `catalog.types.ts`       | Open-tier catalog model/alert statuses and DTOs                       |

## Constants & enums

Key constants live here too (const-object enums, not TS `enum`). Don't hardcode these strings — reference the export:

- **Notes / access:** `PERMISSION`, `ACCESS`, `PERMISSION_LEVELS`, `GENERAL_ACCESS`, `GENERAL_ACCESS_LEVELS`, `NOTE_TITLE_MAX_LENGTH`
- **AI:** `AI_ACTION`, `AI_ACTIONS`, `AI_LANGUAGES`, `AI_TONES`, `MODEL_TIERS`, `MODEL_ID_MAX_LENGTH`, `BYOK_PROVIDERS`
- **Artifacts:** `ARTIFACT_TYPE`, `ARTIFACT_TYPES`, `SM2_QUALITY`, `CARD_STATUS`, `CARD_SESSION_STATUSES`, `RESTART_FILTERS`
- **Collaboration:** `COLLABORATION_EVENTS`
- **Feature flags:** `FEATURE_FLAG_KEYS`
- **Anonymous:** `ANONYMOUS_LIMITS`
- **Catalog:** `CATALOG_MODEL_STATUSES`, `CATALOG_ALERT_KINDS`

See `src/index.ts` for the full export surface.

## Running unit tests

Run `nx test types` to execute the unit tests via [Vitest](https://vitest.dev/).
