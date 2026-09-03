# @knowtis/shared-types

The canonical shared FE/BE contract — domain types and constants used across the entire monorepo (apps, libs and packages). It has **zero workspace dependencies** so it can be safely imported from any project (apps, libs, packages).

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

| File                     | Covers                                                                                                                  |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| `user.types.ts`          | `User`, `UserProfile`, `CreateUserInput`, `UpdateUserInput`, `EMAIL_NOT_VERIFIED_CODE`, `AGENT_EMAIL_NOT_VERIFIED_CODE` |
| `note.types.ts`          | `Note`, `NoteWithOwner`, create/update/share inputs, permission types                                                   |
| `organization.types.ts`  | PARA buckets, bucket filters, list views, tag path rules, supertags and their field catalog, notes pagination           |
| `collaboration.types.ts` | `HANDSHAKE_FAILURE` — the reasons the API refuses a Hocuspocus handshake — and collaboration user/payload types         |
| `ai.types.ts`            | AI actions, languages, tones, model tiers, BYOK providers/secrets                                                       |
| `artifact.types.ts`      | Flashcards, quizzes, summaries, mind maps, SM-2 study progress                                                          |
| `feature-flags.types.ts` | Feature flag keys and DTO                                                                                               |
| `anonymous.types.ts`     | Anonymous-user limits                                                                                                   |
| `catalog.types.ts`       | Open-tier catalog model/alert statuses and DTOs                                                                         |

## Constants & enums

Constants are const-object enums, not TS `enum`. Don't hardcode these strings — reference the export. The most used:

- `PERMISSION`, `ACCESS`, `GENERAL_ACCESS` (note sharing)
- `AI_ACTION`, `MODEL_INTENTS`, `REASONING_EFFORTS`, `BYOK_PROVIDERS` (AI)
- `ARTIFACT_TYPE`, `SM2_QUALITY` (study artifacts)
- `FEATURE_FLAG_KEYS`, `HANDSHAKE_FAILURE`, `ANONYMOUS_LIMITS`

See `src/index.ts` for the full export surface.

## Running unit tests

Run `nx test shared-types` to execute the unit tests via [Vitest](https://vitest.dev/).
