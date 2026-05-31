# Editor Image Upload Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users embed images in the collaborative editor via paste, drag-drop, a `/imagen` slash command, and a toolbar button — compressed client-side, uploaded through NestJS to Vercel Blob, rendered as a `figure` node with editable caption + alt.

**Architecture:** Browser compresses (Canvas → WebP) and shows a local-only ProseMirror placeholder, then `POST`s multipart to NestJS. NestJS validates note write-access + file, `put()`s a **public** blob, records a `note_images` row, and returns `{ url, width, height }`. The editor swaps the placeholder for a real `image` node whose URL syncs to collaborators via the existing Yjs/Hocuspocus pipeline. Image upload lives **inside the notes module** (cohesive with notes, no new module, no circular deps) and reuses `NotesController`'s guard stack.

**Tech Stack:** NestJS 11 + Drizzle (PostgreSQL), `@vercel/blob`, Tiptap 3 / ProseMirror, React 19, TanStack Query, `@knowtis/*` libs.

**Spec:** `docs/superpowers/specs/2026-05-30-editor-image-upload-design.md`

**Reference before coding (project rule):** fetch current docs via Context7 for `@vercel/blob` (`put`/`del` options) and Tiptap v3 custom node / `ReactNodeViewRenderer` / ProseMirror `Decoration` APIs. Verify signatures against the installed versions in `package.json`.

---

## File Structure

**Backend (`apps/api`, all within the existing notes module):**

- Create `src/database/schema/note-images.schema.ts` — `note_images` table.
- Modify `src/database/schema/index.ts` — export new schema.
- Modify `src/config/env.config.ts` — add `VERCEL_BLOB_READ_WRITE_TOKEN`.
- Modify `apps/api/.env.example` — document the token.
- Create `src/modules/notes/domain/ports/image-storage.port.ts` — `ImageStorage` interface + `IMAGE_STORAGE` token.
- Create `src/modules/notes/domain/ports/note-image.repository.ts` — repo interface + `NOTE_IMAGE_REPOSITORY` token.
- Create `src/modules/notes/infrastructure/storage/vercel-blob.storage.ts` — `ImageStorage` impl.
- Create `src/modules/notes/infrastructure/persistence/drizzle-note-image.repository.ts` — repo impl.
- Create `src/modules/notes/application/commands/upload-image.handler.ts` — use case.
- Create `src/modules/notes/dto/upload-image.dto.ts` — multipart body DTO.
- Create `src/modules/notes/infrastructure/filename.util.ts` — `sanitizeFilename`.
- Modify `src/modules/notes/notes.controller.ts` — add `POST :id/images`.
- Modify `src/modules/notes/notes.module.ts` — register handler + providers.
- Modify `src/modules/notes/application/commands/delete-note.handler.ts` — blob cleanup.

**Frontend data layer:**

- Create `libs/api-client/src/lib/images.api.ts` — `imagesApi.upload`.
- Modify `libs/api-client/src/index.ts` — export it.
- Create `libs/data-access/notes/src/image-upload.hooks.ts` — `useUploadImage`.
- Modify `libs/data-access/notes/src/index.ts` — export it.

**Editor package (`packages/editor`):**

- Create `src/extensions/image/ImageNode.ts` — `image` node.
- Create `src/extensions/image/ImageView.tsx` — React NodeView.
- Create `src/extensions/image/image-upload.ts` — paste/drop plugin + provider types.
- Create `src/extensions/image/index.ts` — barrel for the folder.
- Modify `packages/editor/src/index.ts` — export the image extension + types.

**App wiring (`apps/notes`):**

- Create `src/components/editor/image/compress.ts` — Canvas compression util.
- Create `src/components/editor/image/useImagePicker.ts` — hidden file-input hook.
- Modify `src/components/editor/useEditorExtensions.ts` — register node + plugin with provider.
- Modify `src/components/editor/ai/slash-commands.config.ts` — `/imagen` command.
- Modify `packages/editor/src/editor.config.ts` — toolbar image button.
- Modify i18n locale files — slash/toolbar/caption strings.

---

## PHASE 1 — Backend

### Task 1: Dependency + environment variable

**Files:**

- Modify: `apps/api/src/config/env.config.ts:42`
- Modify: `apps/api/.env.example`

- [ ] **Step 1: Install the SDK**

Run: `pnpm add @vercel/blob -w --filter @knowtis/source` (use the workspace flag your repo uses; if unsure, `cd` is not needed — run `pnpm --filter api add @vercel/blob`).
Expected: `@vercel/blob` appears in `apps/api/package.json` dependencies.

- [ ] **Step 2: Add the env var to the Zod schema**

In `apps/api/src/config/env.config.ts`, add inside `envSchemaBase` (after line 42, before the closing `});`):

```typescript
  VERCEL_BLOB_READ_WRITE_TOKEN: z.string().optional(),
```

- [ ] **Step 3: Document it in `.env.example`**

Append to `apps/api/.env.example`:

```bash
# Vercel Blob (image uploads) — create a Blob store in the Vercel dashboard and paste its token
VERCEL_BLOB_READ_WRITE_TOKEN=
```

- [ ] **Step 4: Typecheck**

Run: `pnpm typecheck`
Expected: PASS (no usages yet; schema compiles).

- [ ] **Step 5: Commit**

```bash
git add apps/api/package.json apps/api/src/config/env.config.ts apps/api/.env.example pnpm-lock.yaml
git commit -m "feat(api): add @vercel/blob dep and blob token env var"
```

---

### Task 2: `note_images` table

**Files:**

- Create: `apps/api/src/database/schema/note-images.schema.ts`
- Modify: `apps/api/src/database/schema/index.ts:10`

- [ ] **Step 1: Create the schema**

```typescript
import {
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

import { notes } from './notes.schema';
import { users } from './users.schema';

export const noteImages = pgTable(
  'note_images',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    noteId: uuid('note_id')
      .notNull()
      .references(() => notes.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    pathname: text('pathname').notNull(),
    url: text('url').notNull(),
    size: integer('size').notNull(),
    mimeType: text('mime_type').notNull(),
    width: integer('width'),
    height: integer('height'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index('note_images_note_id_idx').on(table.noteId)]
);

export type NoteImage = typeof noteImages.$inferSelect;
export type NewNoteImage = typeof noteImages.$inferInsert;
```

- [ ] **Step 2: Export from the schema barrel**

Append to `apps/api/src/database/schema/index.ts`:

```typescript
export * from './note-images.schema';
```

- [ ] **Step 3: Push the schema (Docker must be up)**

Run: `pnpm docker:up && pnpm db:push`
Expected: Drizzle reports creating table `note_images`. Confirm with `pnpm db:studio` (table visible).

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/database/schema/note-images.schema.ts apps/api/src/database/schema/index.ts
git commit -m "feat(api): add note_images table"
```

---

### Task 3: ImageStorage port + Vercel Blob adapter

**Files:**

- Create: `apps/api/src/modules/notes/domain/ports/image-storage.port.ts`
- Create: `apps/api/src/modules/notes/infrastructure/storage/vercel-blob.storage.ts`
- Test: `apps/api/src/modules/notes/infrastructure/storage/vercel-blob.storage.spec.ts`

- [ ] **Step 1: Define the port**

```typescript
export interface UploadImageInput {
  readonly noteId: string;
  readonly filename: string;
  readonly data: Buffer;
  readonly contentType: string;
}

export interface UploadedImage {
  readonly url: string;
  readonly pathname: string;
}

export interface ImageStorage {
  upload(input: UploadImageInput): Promise<UploadedImage>;
  delete(pathnames: string[]): Promise<void>;
}

export const IMAGE_STORAGE = Symbol('IMAGE_STORAGE');
```

- [ ] **Step 2: Write the failing test (token-missing throws, path is note-scoped)**

`vercel-blob.storage.spec.ts`:

```typescript
import { ConfigService } from '@nestjs/config';

import { VercelBlobStorage } from './vercel-blob.storage';

const put = jest.fn();
const del = jest.fn();
jest.mock('@vercel/blob', () => ({
  put: (...args: unknown[]) => put(...args),
  del: (...args: unknown[]) => del(...args),
}));

function makeStorage(token: string | undefined) {
  const config = {
    getOrThrow: (key: string) => {
      if (key === 'VERCEL_BLOB_READ_WRITE_TOKEN' && token) return token;
      throw new Error(`Missing ${key}`);
    },
  } as unknown as ConfigService;
  return new VercelBlobStorage(config);
}

describe('VercelBlobStorage', () => {
  beforeEach(() => {
    put.mockReset();
    del.mockReset();
  });

  it('uploads to a note-scoped public path and returns url + pathname', async () => {
    put.mockResolvedValue({
      url: 'https://blob/x.webp',
      pathname: 'notes/n1/x-abc.webp',
    });
    const storage = makeStorage('vercel_blob_token');

    const result = await storage.upload({
      noteId: 'n1',
      filename: 'photo.webp',
      data: Buffer.from('x'),
      contentType: 'image/webp',
    });

    expect(put).toHaveBeenCalledWith(
      'notes/n1/photo.webp',
      expect.any(Buffer),
      expect.objectContaining({
        access: 'public',
        addRandomSuffix: true,
        contentType: 'image/webp',
        token: 'vercel_blob_token',
      })
    );
    expect(result).toEqual({
      url: 'https://blob/x.webp',
      pathname: 'notes/n1/x-abc.webp',
    });
  });

  it('throws when the token is missing', async () => {
    const storage = makeStorage(undefined);
    await expect(
      storage.upload({
        noteId: 'n1',
        filename: 'a.webp',
        data: Buffer.from('x'),
        contentType: 'image/webp',
      })
    ).rejects.toThrow(/VERCEL_BLOB_READ_WRITE_TOKEN/);
  });

  it('skips del when there are no pathnames', async () => {
    const storage = makeStorage('t');
    await storage.delete([]);
    expect(del).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2b: Run it to confirm it fails**

Run: `nx test api --testPathPattern=vercel-blob.storage`
Expected: FAIL ("Cannot find module './vercel-blob.storage'").

- [ ] **Step 3: Implement the adapter**

`vercel-blob.storage.ts` (NOTE the NestJS DI rule: do NOT use `import type` for `ConfigService`):

```typescript
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { del, put } from '@vercel/blob';

import type { EnvConfig } from '../../../../config/env.config';
import type {
  ImageStorage,
  UploadedImage,
  UploadImageInput,
} from '../../domain/ports/image-storage.port';

@Injectable()
export class VercelBlobStorage implements ImageStorage {
  constructor(private readonly configService: ConfigService<EnvConfig, true>) {}

  async upload(input: UploadImageInput): Promise<UploadedImage> {
    const token = this.configService.getOrThrow('VERCEL_BLOB_READ_WRITE_TOKEN');
    const blob = await put(
      `notes/${input.noteId}/${input.filename}`,
      input.data,
      {
        access: 'public',
        addRandomSuffix: true,
        contentType: input.contentType,
        token,
      }
    );
    return { url: blob.url, pathname: blob.pathname };
  }

  async delete(pathnames: string[]): Promise<void> {
    if (pathnames.length === 0) {
      return;
    }
    const token = this.configService.getOrThrow('VERCEL_BLOB_READ_WRITE_TOKEN');
    await del(pathnames, { token });
  }
}
```

- [ ] **Step 4: Run the test to confirm it passes**

Run: `nx test api --testPathPattern=vercel-blob.storage`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/notes/domain/ports/image-storage.port.ts apps/api/src/modules/notes/infrastructure/storage/
git commit -m "feat(api): add ImageStorage port and Vercel Blob adapter"
```

---

### Task 4: `note_images` repository

**Files:**

- Create: `apps/api/src/modules/notes/domain/ports/note-image.repository.ts`
- Create: `apps/api/src/modules/notes/infrastructure/persistence/drizzle-note-image.repository.ts`

> No unit test here — it's a thin Drizzle adapter exercised by the handler test (Task 5) and integration tests. Mirror the existing `drizzle-note-read.repository.ts` for the DB token/injection pattern (how `db` is injected in that file).

- [ ] **Step 1: Define the port**

```typescript
import type { NewNoteImage, NoteImage } from '../../../../database/schema';

export interface NoteImageRepository {
  create(data: NewNoteImage): Promise<NoteImage>;
  findPathnamesByNote(noteId: string): Promise<string[]>;
}

export const NOTE_IMAGE_REPOSITORY = Symbol('NOTE_IMAGE_REPOSITORY');
```

- [ ] **Step 2: Implement with Drizzle**

Open `apps/api/src/modules/notes/infrastructure/persistence/drizzle-note-read.repository.ts`, copy its constructor/`db` injection exactly (same `@Inject(...)` token and import path), then create the new file using that same injection:

```typescript
import { Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';

// Mirror the DB injection used by drizzle-note-read.repository.ts:
// e.g. `@Inject(DRIZZLE) private readonly db: Database`
import { noteImages } from '../../../../database/schema';
import type { NewNoteImage, NoteImage } from '../../../../database/schema';
import type { NoteImageRepository } from '../../domain/ports/note-image.repository';

@Injectable()
export class DrizzleNoteImageRepository implements NoteImageRepository {
  // <copy the exact constructor injection of `db` from drizzle-note-read.repository.ts>

  async create(data: NewNoteImage): Promise<NoteImage> {
    const [row] = await this.db.insert(noteImages).values(data).returning();
    return row;
  }

  async findPathnamesByNote(noteId: string): Promise<string[]> {
    const rows = await this.db
      .select({ pathname: noteImages.pathname })
      .from(noteImages)
      .where(eq(noteImages.noteId, noteId));
    return rows.map((r) => r.pathname);
  }
}
```

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: PASS once the `db` injection matches the read repository.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/notes/domain/ports/note-image.repository.ts apps/api/src/modules/notes/infrastructure/persistence/drizzle-note-image.repository.ts
git commit -m "feat(api): add note_images repository"
```

---

### Task 5: Upload use case + filename util + controller endpoint + module wiring

**Files:**

- Create: `apps/api/src/modules/notes/infrastructure/filename.util.ts`
- Test: `apps/api/src/modules/notes/infrastructure/filename.util.spec.ts`
- Create: `apps/api/src/modules/notes/application/commands/upload-image.handler.ts`
- Test: `apps/api/src/modules/notes/application/commands/upload-image.handler.spec.ts`
- Create: `apps/api/src/modules/notes/dto/upload-image.dto.ts`
- Modify: `apps/api/src/modules/notes/notes.controller.ts`
- Modify: `apps/api/src/modules/notes/notes.module.ts`

- [ ] **Step 1: Failing test for `sanitizeFilename`**

`filename.util.spec.ts`:

```typescript
import { sanitizeFilename } from './filename.util';

describe('sanitizeFilename', () => {
  it('keeps a safe base name and extension', () => {
    expect(sanitizeFilename('My Photo.PNG')).toBe('my-photo.png');
  });
  it('strips path segments and unsafe chars', () => {
    expect(sanitizeFilename('../../etc/p@ss!.jpeg')).toBe('p-ss.jpeg');
  });
  it('falls back to "image" when name is empty after cleaning', () => {
    expect(sanitizeFilename('***')).toBe('image');
  });
});
```

- [ ] **Step 2: Run it (FAIL)**

Run: `nx test api --testPathPattern=filename.util`
Expected: FAIL ("Cannot find module './filename.util'").

- [ ] **Step 3: Implement `sanitizeFilename`**

`filename.util.ts`:

```typescript
export function sanitizeFilename(original: string): string {
  const base = original.split(/[\\/]/).pop() ?? '';
  const dot = base.lastIndexOf('.');
  const rawName = dot > 0 ? base.slice(0, dot) : base;
  const rawExt = dot > 0 ? base.slice(dot + 1) : '';
  const clean = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  const name = clean(rawName) || 'image';
  const ext = clean(rawExt);
  return ext ? `${name}.${ext}` : name;
}
```

- [ ] **Step 4: Run it (PASS)**

Run: `nx test api --testPathPattern=filename.util`
Expected: PASS (3 tests).

- [ ] **Step 5: Failing test for `UploadImageHandler`**

`upload-image.handler.spec.ts`:

```typescript
import type { UserId } from '@jovandyaz/auth/server';

import { UploadImageHandler } from './upload-image.handler';

function setup(overrides: { ownerId?: string; hasAccess?: boolean } = {}) {
  const note = { id: 'n1', ownerId: overrides.ownerId ?? 'owner' };
  const noteRepo = { findById: jest.fn().mockResolvedValue(note) };
  const permRepo = {
    hasAccess: jest.fn().mockResolvedValue(overrides.hasAccess ?? false),
  };
  const storage = {
    upload: jest
      .fn()
      .mockResolvedValue({
        url: 'https://blob/x.webp',
        pathname: 'notes/n1/x.webp',
      }),
    delete: jest.fn(),
  };
  const imageRepo = {
    create: jest
      .fn()
      .mockImplementation((d) => Promise.resolve({ id: 'img1', ...d })),
    findPathnamesByNote: jest.fn(),
  };
  const handler = new UploadImageHandler(
    noteRepo as never,
    permRepo as never,
    imageRepo as never,
    storage as never
  );
  return { handler, noteRepo, permRepo, storage, imageRepo };
}

const input = {
  noteId: 'n1',
  filename: 'p.webp',
  data: Buffer.from('x'),
  contentType: 'image/webp',
  size: 10,
  width: 800,
  height: 600,
};

describe('UploadImageHandler', () => {
  it('uploads and records a row when the user is the owner', async () => {
    const { handler, storage, imageRepo } = setup({ ownerId: 'owner' });
    const result = await handler.execute({ ...input, userId: 'owner' });
    expect(result.isOk()).toBe(true);
    expect(storage.upload).toHaveBeenCalled();
    expect(imageRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        noteId: 'n1',
        userId: 'owner',
        url: 'https://blob/x.webp',
        mimeType: 'image/webp',
        width: 800,
        height: 600,
      })
    );
  });

  it('allows an editor with access', async () => {
    const { handler, permRepo } = setup({
      ownerId: 'someone',
      hasAccess: true,
    });
    const result = await handler.execute({ ...input, userId: 'editor' });
    expect(result.isOk()).toBe(true);
    expect(permRepo.hasAccess).toHaveBeenCalledWith(
      'n1',
      'editor' as UserId,
      'editor'
    );
  });

  it('rejects a user without write access (no upload)', async () => {
    const { handler, storage } = setup({
      ownerId: 'someone',
      hasAccess: false,
    });
    const result = await handler.execute({ ...input, userId: 'intruder' });
    expect(result.isErr()).toBe(true);
    expect(storage.upload).not.toHaveBeenCalled();
  });

  it('errors when the note does not exist', async () => {
    const { handler, noteRepo } = setup();
    noteRepo.findById.mockResolvedValue(null);
    const result = await handler.execute({ ...input, userId: 'owner' });
    expect(result.isErr()).toBe(true);
  });
});
```

- [ ] **Step 6: Run it (FAIL)**

Run: `nx test api --testPathPattern=upload-image.handler`
Expected: FAIL ("Cannot find module './upload-image.handler'").

- [ ] **Step 7: Implement the handler**

`upload-image.handler.ts`:

```typescript
import type { UserId } from '@jovandyaz/auth/server';
import { Inject, Injectable } from '@nestjs/common';
import { err, ok, type Result } from 'neverthrow';

import type { NoteImage } from '../../../../database/schema';
import {
  NOTE_REPOSITORY,
  NoteErrors,
  PERMISSION_REPOSITORY,
  type NoteDomainError,
  type NoteRepository,
  type PermissionRepository,
} from '../../domain';
import {
  IMAGE_STORAGE,
  type ImageStorage,
} from '../../domain/ports/image-storage.port';
import {
  NOTE_IMAGE_REPOSITORY,
  type NoteImageRepository,
} from '../../domain/ports/note-image.repository';

export interface UploadImageInput {
  readonly noteId: string;
  readonly userId: string;
  readonly filename: string;
  readonly data: Buffer;
  readonly contentType: string;
  readonly size: number;
  readonly width?: number;
  readonly height?: number;
}

@Injectable()
export class UploadImageHandler {
  constructor(
    @Inject(NOTE_REPOSITORY) private readonly noteRepository: NoteRepository,
    @Inject(PERMISSION_REPOSITORY)
    private readonly permissionRepository: PermissionRepository,
    @Inject(NOTE_IMAGE_REPOSITORY)
    private readonly noteImageRepository: NoteImageRepository,
    @Inject(IMAGE_STORAGE) private readonly imageStorage: ImageStorage
  ) {}

  async execute(
    input: UploadImageInput
  ): Promise<Result<NoteImage, NoteDomainError>> {
    const note = await this.noteRepository.findById(input.noteId);
    if (!note) {
      return err(NoteErrors.noteNotFound(input.noteId));
    }

    const canWrite =
      note.ownerId === input.userId ||
      (await this.permissionRepository.hasAccess(
        input.noteId,
        input.userId as UserId,
        'editor'
      ));
    if (!canWrite) {
      return err(NoteErrors.permissionDenied('No write access to this note'));
    }

    const uploaded = await this.imageStorage.upload({
      noteId: input.noteId,
      filename: input.filename,
      data: input.data,
      contentType: input.contentType,
    });

    const row = await this.noteImageRepository.create({
      noteId: input.noteId,
      userId: input.userId,
      pathname: uploaded.pathname,
      url: uploaded.url,
      size: input.size,
      mimeType: input.contentType,
      width: input.width ?? null,
      height: input.height ?? null,
    });

    return ok(row);
  }
}
```

> If `NoteErrors`, `NOTE_REPOSITORY`, `PERMISSION_REPOSITORY`, `NoteRepository`, `PermissionRepository` are not all re-exported from `../../domain`, import each from its concrete path (mirror `delete-note.handler.ts` and `domain/ports/permission.repository.ts`). The permission level string is `'editor'` per `permissionEnum`.

- [ ] **Step 8: Run it (PASS)**

Run: `nx test api --testPathPattern=upload-image.handler`
Expected: PASS (4 tests).

- [ ] **Step 9: Create the DTO**

`upload-image.dto.ts`:

```typescript
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Min } from 'class-validator';

export class UploadImageDto {
  @ApiPropertyOptional({ description: 'Intrinsic image width in pixels' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  width?: number;

  @ApiPropertyOptional({ description: 'Intrinsic image height in pixels' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  height?: number;
}
```

- [ ] **Step 10: Add the endpoint to `NotesController`**

In `notes.controller.ts`: ensure these are imported from `@nestjs/common` (add any missing to the existing import): `Post`, `Param`, `ParseUUIDPipe`, `ParseFilePipe`, `MaxFileSizeValidator`, `FileTypeValidator`, `UploadedFile`, `UseInterceptors`. Add `FileInterceptor` from `@nestjs/platform-express`, `ApiConsumes`/`ApiBody` from `@nestjs/swagger`, the `UploadImageDto`, the `UploadImageHandler`, and `sanitizeFilename`.

Inject the handler into the constructor (mirror the existing handler injections), then add the method. **Copy the exact decorator stack (`@RequirePermission`, `@RequireMcpScope`, Swagger error decorators) from the existing `PATCH`/update endpoint in this same controller** so guard semantics match:

```typescript
  @ApiOperation({ summary: 'Upload an image to a note' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: { type: 'string', format: 'binary' },
        width: { type: 'integer' },
        height: { type: 'integer' },
      },
    },
  })
  @ApiResponse({
    status: 201,
    description: 'Uploaded image metadata',
    schema: {
      type: 'object',
      properties: {
        id: { type: 'string', format: 'uuid' },
        url: { type: 'string', example: 'https://<store>.public.blob.vercel-storage.com/notes/<id>/photo-abc.webp' },
        width: { type: 'integer', nullable: true },
        height: { type: 'integer', nullable: true },
      },
    },
  })
  @ApiBadRequest('invalid image file (type or size)')
  // <-- mirror the @RequirePermission('update', SUBJECTS.Note) + @RequireMcpScope('write')
  //     used by the update endpoint in this controller
  @Post(':id/images')
  @UseInterceptors(FileInterceptor('file'))
  async uploadImage(
    @Param('id', ParseUUIDPipe) noteId: string,
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: 10 * 1024 * 1024 }),
          new FileTypeValidator({
            fileType: /^image\/(png|jpe?g|gif|webp)$/,
            skipMagicNumbersValidation: true,
          }),
        ],
      })
    )
    file: Express.Multer.File,
    @Body() dto: UploadImageDto,
    @CurrentUser() user: RequestUser
  ) {
    const result = await this.uploadImageHandler.execute({
      noteId,
      userId: user.id,
      filename: sanitizeFilename(file.originalname),
      data: file.buffer,
      contentType: file.mimetype,
      size: file.size,
      ...(dto.width !== undefined && { width: dto.width }),
      ...(dto.height !== undefined && { height: dto.height }),
    });
    return unwrapOrThrow(result);
  }
```

- [ ] **Step 11: Register providers in `NotesModule`**

In `notes.module.ts`, add to `providers`: `UploadImageHandler`, and bind the two new ports:

```typescript
    UploadImageHandler,
    { provide: IMAGE_STORAGE, useClass: VercelBlobStorage },
    { provide: NOTE_IMAGE_REPOSITORY, useClass: DrizzleNoteImageRepository },
```

Add the matching imports at the top of the module file. (No need to export them unless another module consumes them — the cleanup in Task 6 lives in this same module.)

- [ ] **Step 12: Typecheck + run note tests**

Run: `pnpm typecheck && nx test api --testPathPattern="notes"`
Expected: PASS.

- [ ] **Step 13: Commit**

```bash
git add apps/api/src/modules/notes/
git commit -m "feat(api): add POST /notes/:id/images upload endpoint"
```

---

### Task 6: Blob cleanup on note delete

**Files:**

- Modify: `apps/api/src/modules/notes/application/commands/delete-note.handler.ts`
- Test: `apps/api/src/modules/notes/application/commands/delete-note.handler.spec.ts` (create if absent)

- [ ] **Step 1: Failing test — blobs deleted before the note row**

`delete-note.handler.spec.ts`:

```typescript
import { ok } from 'neverthrow';

import { DeleteNoteHandler } from './delete-note.handler';

describe('DeleteNoteHandler image cleanup', () => {
  it('deletes the note images blobs when the owner deletes the note', async () => {
    const noteRepo = {
      findById: jest.fn().mockResolvedValue({ id: 'n1', ownerId: 'owner' }),
      delete: jest.fn().mockResolvedValue(ok(true)),
    };
    const imageRepo = {
      findPathnamesByNote: jest
        .fn()
        .mockResolvedValue(['notes/n1/a.webp', 'notes/n1/b.webp']),
    };
    const storage = { delete: jest.fn().mockResolvedValue(undefined) };

    const handler = new DeleteNoteHandler(
      noteRepo as never,
      imageRepo as never,
      storage as never
    );
    const result = await handler.execute({ noteId: 'n1', userId: 'owner' });

    expect(result.isOk()).toBe(true);
    expect(imageRepo.findPathnamesByNote).toHaveBeenCalledWith('n1');
    expect(storage.delete).toHaveBeenCalledWith([
      'notes/n1/a.webp',
      'notes/n1/b.webp',
    ]);
    expect(noteRepo.delete).toHaveBeenCalledWith('n1');
  });
});
```

- [ ] **Step 2: Run it (FAIL — constructor arity / undefined deps)**

Run: `nx test api --testPathPattern=delete-note.handler`
Expected: FAIL.

- [ ] **Step 3: Add cleanup to the handler**

Update `delete-note.handler.ts` — inject the new ports and delete blobs best-effort before deleting the note (pathnames must be read before the FK cascade removes the rows):

```typescript
import { Inject, Injectable, Logger } from '@nestjs/common';
import { err, type Result } from 'neverthrow';

import {
  NOTE_REPOSITORY,
  NoteErrors,
  type NoteDomainError,
  type NoteRepository,
} from '../../domain';
import {
  IMAGE_STORAGE,
  type ImageStorage,
} from '../../domain/ports/image-storage.port';
import {
  NOTE_IMAGE_REPOSITORY,
  type NoteImageRepository,
} from '../../domain/ports/note-image.repository';

export interface DeleteNoteInput {
  readonly noteId: string;
  readonly userId: string;
}

@Injectable()
export class DeleteNoteHandler {
  private readonly logger = new Logger(DeleteNoteHandler.name);

  constructor(
    @Inject(NOTE_REPOSITORY) private readonly noteRepository: NoteRepository,
    @Inject(NOTE_IMAGE_REPOSITORY)
    private readonly noteImageRepository: NoteImageRepository,
    @Inject(IMAGE_STORAGE) private readonly imageStorage: ImageStorage
  ) {}

  async execute(
    input: DeleteNoteInput
  ): Promise<Result<boolean, NoteDomainError>> {
    const note = await this.noteRepository.findById(input.noteId);
    if (!note) {
      return err(NoteErrors.noteNotFound(input.noteId));
    }

    if (note.ownerId !== input.userId) {
      return err(
        NoteErrors.permissionDenied('Only owner can delete this note')
      );
    }

    const pathnames = await this.noteImageRepository.findPathnamesByNote(
      input.noteId
    );
    try {
      await this.imageStorage.delete(pathnames);
    } catch (error) {
      this.logger.warn(
        `Failed to delete blobs for note ${input.noteId}; rows will still cascade`,
        error
      );
    }

    return this.noteRepository.delete(input.noteId);
  }
}
```

- [ ] **Step 4: Run it (PASS)**

Run: `nx test api --testPathPattern=delete-note.handler`
Expected: PASS.

- [ ] **Step 5: Typecheck whole workspace**

Run: `pnpm typecheck`
Expected: PASS (DeleteNoteHandler still constructed by DI — providers already registered in Task 5).

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/notes/application/commands/delete-note.handler.ts apps/api/src/modules/notes/application/commands/delete-note.handler.spec.ts
git commit -m "feat(api): delete note image blobs on note deletion"
```

---

## PHASE 2 — Frontend data layer

### Task 7: api-client image adapter

**Files:**

- Create: `libs/api-client/src/lib/images.api.ts`
- Modify: `libs/api-client/src/index.ts`

> `http-client.ts:112` already detects `FormData`, skips JSON `Content-Type`, and injects the bearer token — so the adapter just builds `FormData` and calls `post`.

- [ ] **Step 1: Implement the adapter**

```typescript
import { httpClient } from './http-client';

export interface UploadImageResponse {
  id: string;
  url: string;
  width: number | null;
  height: number | null;
}

export interface UploadImageArgs {
  noteId: string;
  file: Blob;
  filename: string;
  width?: number;
  height?: number;
  signal?: AbortSignal;
}

export const imagesApi = {
  async upload({
    noteId,
    file,
    filename,
    width,
    height,
    signal,
  }: UploadImageArgs): Promise<UploadImageResponse> {
    const form = new FormData();
    form.append('file', file, filename);
    if (width !== undefined) {
      form.append('width', String(width));
    }
    if (height !== undefined) {
      form.append('height', String(height));
    }
    return httpClient.post<UploadImageResponse>(
      `/notes/${encodeURIComponent(noteId)}/images`,
      form,
      signal ? { signal } : undefined
    );
  },
};
```

> Confirm the `httpClient` import path matches how `notes.api.ts` imports it (same file uses `httpClient`). If `post`'s 3rd arg shape differs, mirror `notes.api.ts`.

- [ ] **Step 2: Export it**

Add to `libs/api-client/src/index.ts` (mirror existing exports):

```typescript
export * from './lib/images.api';
```

- [ ] **Step 3: Typecheck + lint**

Run: `pnpm typecheck && nx lint api-client`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add libs/api-client/src/lib/images.api.ts libs/api-client/src/index.ts
git commit -m "feat(api-client): add image upload adapter"
```

---

### Task 8: `useUploadImage` hook

**Files:**

- Create: `libs/data-access/notes/src/image-upload.hooks.ts`
- Modify: `libs/data-access/notes/src/index.ts`

- [ ] **Step 1: Implement the hook**

> The editor owns the optimistic placeholder, so no cache mutation is needed here — just a mutation that calls the adapter. Surface errors to the caller (the editor plugin shows the toast).

```typescript
import { useMutation } from '@tanstack/react-query';

import { imagesApi } from '@knowtis/api-client';
import type { UploadImageArgs, UploadImageResponse } from '@knowtis/api-client';

export function useUploadImage() {
  return useMutation<UploadImageResponse, Error, UploadImageArgs>({
    mutationFn: (args) => imagesApi.upload(args),
  });
}
```

- [ ] **Step 2: Export it**

Add to `libs/data-access/notes/src/index.ts`:

```typescript
export * from './image-upload.hooks';
```

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add libs/data-access/notes/src/image-upload.hooks.ts libs/data-access/notes/src/index.ts
git commit -m "feat(data-access): add useUploadImage hook"
```

---

## PHASE 3 — Editor package (`packages/editor`)

### Task 9: `image` node + React NodeView

**Files:**

- Create: `packages/editor/src/extensions/image/ImageNode.ts`
- Create: `packages/editor/src/extensions/image/ImageView.tsx`

> Verify Tiptap v3 node options against Context7 before editing. This node uses the **figure pattern**: `content: 'inline*'` holds the caption; the `<img>` is rendered from attributes.

- [ ] **Step 1: Create `ImageNode.ts`**

```typescript
import { mergeAttributes, Node } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';

import { ImageView } from './ImageView';

export interface ImageAttributes {
  src: string;
  alt: string;
  width: number | null;
  height: number | null;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    image: {
      setImage: (attrs: {
        src: string;
        alt?: string;
        width?: number | null;
        height?: number | null;
      }) => ReturnType;
    };
  }
}

export const ImageNode = Node.create({
  name: 'image',
  group: 'block',
  content: 'inline*',
  draggable: false,
  selectable: true,
  isolating: true,

  addAttributes() {
    return {
      src: { default: '' },
      alt: { default: '' },
      width: { default: null },
      height: { default: null },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'figure[data-image]',
        getAttrs: (node) => {
          const img = (node as HTMLElement).querySelector('img');
          if (!img) {
            return false;
          }
          const w = img.getAttribute('width');
          const h = img.getAttribute('height');
          return {
            src: img.getAttribute('src') ?? '',
            alt: img.getAttribute('alt') ?? '',
            width: w ? Number(w) : null,
            height: h ? Number(h) : null,
          };
        },
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    const { src, alt, width, height } = HTMLAttributes as Record<
      string,
      unknown
    >;
    return [
      'figure',
      { 'data-image': '' },
      [
        'img',
        mergeAttributes(
          { src, alt },
          width ? { width } : {},
          height ? { height } : {}
        ),
      ],
      ['figcaption', {}, 0],
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(ImageView);
  },

  addCommands() {
    return {
      setImage:
        (attrs) =>
        ({ commands }) =>
          commands.insertContent({
            type: this.name,
            attrs: {
              src: attrs.src,
              alt: attrs.alt ?? '',
              width: attrs.width ?? null,
              height: attrs.height ?? null,
            },
          }),
    };
  },
});
```

- [ ] **Step 2: Create `ImageView.tsx`**

> Mirror `AIBlockView` for imports/structure (`NodeViewWrapper`, `NodeViewContent` from `@tiptap/react`). Caption = `NodeViewContent` rendered as `<figcaption>`. Floating toolbar shows on selection with alt-edit, replace (re-trigger picker via a passed handler is out-of-scope here — replace = delete + re-add later), and delete. Use design-system primitives where practical; keep it dependency-light.

```tsx
import { useState } from 'react';

import {
  NodeViewContent,
  NodeViewWrapper,
  type NodeViewProps,
} from '@tiptap/react';
import { ImageOff, Pencil, Trash2 } from 'lucide-react';

export function ImageView({
  node,
  selected,
  updateAttributes,
  deleteNode,
}: NodeViewProps) {
  const { src, alt, width, height } = node.attrs as {
    src: string;
    alt: string;
    width: number | null;
    height: number | null;
  };
  const [editingAlt, setEditingAlt] = useState(false);

  return (
    <NodeViewWrapper className="group relative my-4" data-selected={selected}>
      <div className="relative inline-block max-w-full">
        {src ? (
          <img
            src={src}
            alt={alt}
            width={width ?? undefined}
            height={height ?? undefined}
            className="h-auto max-w-full rounded-(--radius) border border-(--border)"
            contentEditable={false}
            draggable={false}
          />
        ) : (
          <div className="flex items-center gap-2 rounded-(--radius) border border-(--border) bg-(--muted) p-4 text-(--muted-foreground)">
            <ImageOff className="h-4 w-4" /> Imagen no disponible
          </div>
        )}

        {selected && (
          <div className="absolute right-2 top-2 flex items-center gap-1 rounded-(--radius) border border-(--border) bg-(--popover)/90 p-1 shadow-sm backdrop-blur">
            <button
              type="button"
              className="rounded p-1 hover:bg-(--accent)"
              aria-label="Editar texto alternativo"
              onClick={() => setEditingAlt((v) => !v)}
            >
              <Pencil className="h-4 w-4" />
            </button>
            <button
              type="button"
              className="rounded p-1 text-(--destructive) hover:bg-(--accent)"
              aria-label="Eliminar imagen"
              onClick={() => deleteNode()}
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>

      {editingAlt && (
        <input
          className="mt-1 w-full rounded-(--radius) border border-(--border) bg-transparent px-2 py-1 text-sm"
          placeholder="Texto alternativo (accesibilidad)"
          defaultValue={alt}
          contentEditable={false}
          onBlur={(e) => {
            updateAttributes({ alt: e.target.value });
            setEditingAlt(false);
          }}
        />
      )}

      <NodeViewContent
        as="figcaption"
        className="mt-1 text-center text-sm text-(--muted-foreground) empty:before:content-[attr(data-placeholder)]"
        data-placeholder="Escribe un pie de foto…"
      />
    </NodeViewWrapper>
  );
}
```

- [ ] **Step 3: Typecheck the package**

Run: `nx typecheck editor` (or `pnpm typecheck`)
Expected: PASS. (Adjust `NodeViewProps` field names if Tiptap v3 differs — confirm via Context7.)

- [ ] **Step 4: Commit**

```bash
git add packages/editor/src/extensions/image/ImageNode.ts packages/editor/src/extensions/image/ImageView.tsx
git commit -m "feat(editor): add image node with caption and alt"
```

---

### Task 10: Upload plugin (paste/drop + local placeholder) + provider types + exports

**Files:**

- Create: `packages/editor/src/extensions/image/image-upload.ts`
- Test: `packages/editor/src/extensions/image/image-upload.spec.ts`
- Create: `packages/editor/src/extensions/image/index.ts`
- Modify: `packages/editor/src/index.ts`

- [ ] **Step 1: Failing test for the file-detection helper**

`image-upload.spec.ts`:

```typescript
import { ACCEPTED_IMAGE_TYPES, extractImageFiles } from './image-upload';

function fileOfType(type: string): File {
  return new File([new Uint8Array([1, 2, 3])], `x.${type.split('/')[1]}`, {
    type,
  });
}

describe('extractImageFiles', () => {
  it('keeps only accepted image types', () => {
    const list = [
      fileOfType('image/png'),
      fileOfType('image/webp'),
      fileOfType('image/gif'),
      fileOfType('application/pdf'),
      fileOfType('text/plain'),
    ];
    const result = extractImageFiles(list);
    expect(result.map((f) => f.type)).toEqual([
      'image/png',
      'image/webp',
      'image/gif',
    ]);
  });

  it('returns empty for no images', () => {
    expect(extractImageFiles([fileOfType('application/json')])).toEqual([]);
  });

  it('exposes the accepted types for the file picker', () => {
    expect(ACCEPTED_IMAGE_TYPES).toContain('image/png');
    expect(ACCEPTED_IMAGE_TYPES).toContain('image/webp');
  });
});
```

- [ ] **Step 2: Run it (FAIL)**

Run: `nx test editor --testPathPattern=image-upload`
Expected: FAIL ("Cannot find module './image-upload'").

- [ ] **Step 3: Implement the plugin**

`image-upload.ts` — the provider does compression + network; the plugin owns placeholder lifecycle. Placeholder is a **local-only** `Decoration` set (never enters the doc, so it never syncs through Yjs).

```typescript
import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

export const ACCEPTED_IMAGE_TYPES = [
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
] as const;

export interface UploadedImageResult {
  src: string;
  width: number | null;
  height: number | null;
  alt: string;
}

export type ImageUploadProvider = (
  file: File,
  signal: AbortSignal
) => Promise<UploadedImageResult>;

export interface ImageUploadOptions {
  provider: ImageUploadProvider | null;
  onError: (error: unknown) => void;
}

export function extractImageFiles(files: ArrayLike<File>): File[] {
  return Array.from(files).filter((file) =>
    (ACCEPTED_IMAGE_TYPES as readonly string[]).includes(file.type)
  );
}

const imageUploadKey = new PluginKey<DecorationSet>('imageUpload');

interface PlaceholderMeta {
  add?: { id: symbol; pos: number };
  remove?: { id: symbol };
}

function createPlaceholder(): HTMLElement {
  const el = document.createElement('div');
  el.className =
    'my-2 flex items-center gap-2 rounded-md border border-(--border) bg-(--muted) px-3 py-2 text-sm text-(--muted-foreground)';
  el.setAttribute('data-image-uploading', '');
  el.textContent = 'Subiendo imagen…';
  return el;
}

export const ImageUpload = Extension.create<ImageUploadOptions>({
  name: 'imageUpload',

  addOptions() {
    return {
      provider: null,
      onError: () => undefined,
    };
  },

  addProseMirrorPlugins() {
    const editor = this.editor;
    const options = this.options;

    const startUpload = (file: File, pos: number) => {
      if (!options.provider) {
        return;
      }
      const id = Symbol('upload');
      const controller = new AbortController();

      const tr = editor.state.tr.setMeta(imageUploadKey, {
        add: { id, pos },
      } satisfies PlaceholderMeta);
      editor.view.dispatch(tr);

      options
        .provider(file, controller.signal)
        .then((result) => {
          const decos = imageUploadKey.getState(editor.state);
          const found = decos?.find(
            undefined,
            undefined,
            (spec) => spec.id === id
          );
          const at = found && found.length ? found[0].from : null;

          const cleanup = editor.state.tr.setMeta(imageUploadKey, {
            remove: { id },
          } satisfies PlaceholderMeta);
          editor.view.dispatch(cleanup);

          if (at === null) {
            return;
          }
          editor
            .chain()
            .insertContentAt(at, {
              type: 'image',
              attrs: {
                src: result.src,
                alt: result.alt,
                width: result.width,
                height: result.height,
              },
            })
            .run();
        })
        .catch((error) => {
          const cleanup = editor.state.tr.setMeta(imageUploadKey, {
            remove: { id },
          } satisfies PlaceholderMeta);
          editor.view.dispatch(cleanup);
          options.onError(error);
        });
    };

    return [
      new Plugin<DecorationSet>({
        key: imageUploadKey,
        state: {
          init: () => DecorationSet.empty,
          apply(tr, set) {
            let next = set.map(tr.mapping, tr.doc);
            const meta = tr.getMeta(imageUploadKey) as
              | PlaceholderMeta
              | undefined;
            if (meta?.add) {
              const widget = Decoration.widget(
                meta.add.pos,
                createPlaceholder,
                {
                  id: meta.add.id,
                  side: -1,
                }
              );
              next = next.add(tr.doc, [widget]);
            }
            if (meta?.remove) {
              next = next.remove(
                next.find(
                  undefined,
                  undefined,
                  (spec) => spec.id === meta.remove?.id
                )
              );
            }
            return next;
          },
        },
        props: {
          decorations(state) {
            return imageUploadKey.getState(state);
          },
          handlePaste(view, event) {
            const files = event.clipboardData?.files;
            const images = files ? extractImageFiles(files) : [];
            if (images.length === 0) {
              return false;
            }
            event.preventDefault();
            const pos = view.state.selection.from;
            images.forEach((file) => startUpload(file, pos));
            return true;
          },
          handleDrop(view, event) {
            const files = (event as DragEvent).dataTransfer?.files;
            const images = files ? extractImageFiles(files) : [];
            if (images.length === 0) {
              return false;
            }
            event.preventDefault();
            const coords = view.posAtCoords({
              left: (event as DragEvent).clientX,
              top: (event as DragEvent).clientY,
            });
            const pos = coords?.pos ?? view.state.selection.from;
            images.forEach((file) => startUpload(file, pos));
            return true;
          },
        },
      }),
    ];
  },
});
```

> The `find(...)` predicate signature and `Decoration.widget` spec access vary slightly across ProseMirror versions — confirm against the installed `@tiptap/pm` via Context7 and adjust the `find`/`spec.id` lookups if needed. The behavioral contract (add widget at pos, remove by id, insert `image` node at the mapped position) must hold.

- [ ] **Step 4: Run the helper test (PASS)**

Run: `nx test editor --testPathPattern=image-upload`
Expected: PASS (3 tests).

- [ ] **Step 5: Barrel + package exports**

`packages/editor/src/extensions/image/index.ts`:

```typescript
export { ImageNode } from './ImageNode';
export {
  ImageUpload,
  extractImageFiles,
  ACCEPTED_IMAGE_TYPES,
} from './image-upload';
export type {
  ImageUploadProvider,
  ImageUploadOptions,
  UploadedImageResult,
} from './image-upload';
```

Add to `packages/editor/src/index.ts` (mirror existing extension exports):

```typescript
export * from './extensions/image';
```

- [ ] **Step 6: Typecheck + commit**

Run: `pnpm typecheck`
Expected: PASS.

```bash
git add packages/editor/src/extensions/image/ packages/editor/src/index.ts
git commit -m "feat(editor): add image paste/drop upload plugin"
```

---

### Task 11: Client compression util

**Files:**

- Create: `apps/notes/src/components/editor/image/compress.ts`
- Test: `apps/notes/src/components/editor/image/compress.spec.ts`

- [ ] **Step 1: Failing test for the resize math (pure helper)**

`compress.spec.ts`:

```typescript
import { computeTargetSize, MAX_DIMENSION } from './compress';

describe('computeTargetSize', () => {
  it('leaves small images unchanged', () => {
    expect(computeTargetSize(800, 600)).toEqual({ width: 800, height: 600 });
  });
  it('scales down a wide image to the max long side', () => {
    expect(computeTargetSize(3200, 1600)).toEqual({
      width: MAX_DIMENSION,
      height: MAX_DIMENSION / 2,
    });
  });
  it('scales down a tall image to the max long side', () => {
    expect(computeTargetSize(1000, 4000)).toEqual({
      width: 400,
      height: MAX_DIMENSION,
    });
  });
});
```

- [ ] **Step 2: Run it (FAIL)**

Run: `nx test notes --testPathPattern=compress`
Expected: FAIL ("Cannot find module './compress'").

- [ ] **Step 3: Implement compression**

```typescript
export const MAX_DIMENSION = 1600;
const WEBP_QUALITY = 0.8;

export interface CompressedImage {
  blob: Blob;
  filename: string;
  width: number;
  height: number;
}

export function computeTargetSize(
  width: number,
  height: number
): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= MAX_DIMENSION) {
    return { width, height };
  }
  const scale = MAX_DIMENSION / longest;
  return {
    width: Math.round(width * scale),
    height: Math.round(height * scale),
  };
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = (e) => {
      URL.revokeObjectURL(url);
      reject(e);
    };
    img.src = url;
  });
}

function replaceExt(name: string, ext: string): string {
  const dot = name.lastIndexOf('.');
  return `${dot > 0 ? name.slice(0, dot) : name}.${ext}`;
}

/**
 * Resizes to <= MAX_DIMENSION on the long side and re-encodes as WebP.
 * GIFs pass through untouched to preserve animation. Falls back to the
 * original file if the Canvas/WebP path is unavailable.
 */
export async function compressImage(file: File): Promise<CompressedImage> {
  if (file.type === 'image/gif') {
    const img = await loadImage(file).catch(() => null);
    return {
      blob: file,
      filename: file.name,
      width: img?.naturalWidth ?? 0,
      height: img?.naturalHeight ?? 0,
    };
  }

  try {
    const img = await loadImage(file);
    const target = computeTargetSize(img.naturalWidth, img.naturalHeight);
    const canvas = document.createElement('canvas');
    canvas.width = target.width;
    canvas.height = target.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('2d context unavailable');
    }
    ctx.drawImage(img, 0, 0, target.width, target.height);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/webp', WEBP_QUALITY)
    );
    if (!blob) {
      throw new Error('toBlob returned null');
    }
    return {
      blob,
      filename: replaceExt(file.name, 'webp'),
      width: target.width,
      height: target.height,
    };
  } catch {
    return { blob: file, filename: file.name, width: 0, height: 0 };
  }
}
```

- [ ] **Step 4: Run it (PASS)**

Run: `nx test notes --testPathPattern=compress`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/notes/src/components/editor/image/compress.ts apps/notes/src/components/editor/image/compress.spec.ts
git commit -m "feat(notes): add client-side image compression util"
```

---

## PHASE 4 — App wiring

### Task 12: Provider wiring + register node & plugin

**Files:**

- Create: `apps/notes/src/components/editor/image/createImageUploadProvider.ts`
- Modify: `apps/notes/src/components/editor/useEditorExtensions.ts`

- [ ] **Step 1: Create the provider factory**

> Bridges the editor's `ImageUploadProvider` contract to compression + the data-access layer. Lives in the app (where `@knowtis/*` data libs are allowed). Uses the imperative `imagesApi` to avoid calling a hook outside React.

```typescript
import { imagesApi } from '@knowtis/api-client';
import { toast } from '@knowtis/design-system';
import type { ImageUploadProvider } from '@knowtis/editor';

import { compressImage } from './compress';

export function createImageUploadProvider(
  getNoteId: () => string
): ImageUploadProvider {
  return async (file, signal) => {
    const compressed = await compressImage(file);
    const response = await imagesApi.upload({
      noteId: getNoteId(),
      file: compressed.blob,
      filename: compressed.filename,
      ...(compressed.width > 0 && { width: compressed.width }),
      ...(compressed.height > 0 && { height: compressed.height }),
      signal,
    });
    return {
      src: response.url,
      width: response.width,
      height: response.height,
      alt: compressed.filename.replace(/\.[^.]+$/, ''),
    };
  };
}
```

> Confirm `toast` is exported from `@knowtis/design-system`; if the app imports `toast` directly from `sonner` elsewhere, use that instead. (Toast is actually fired in the plugin's `onError` — see Step 2; remove the unused import if not needed here.)

- [ ] **Step 2: Register node + plugin in `useEditorExtensions`**

Edit `apps/notes/src/components/editor/useEditorExtensions.ts`:

Add imports:

```typescript
import { toast } from 'sonner';

import { ImageNode, ImageUpload } from '@knowtis/editor';

import { createImageUploadProvider } from './image/createImageUploadProvider';
```

Change the hook signature to receive the note id, then register the extensions. The provider needs the current note id; pass it from the caller (the collaborative editor already knows `noteId`). Add `noteId: string` as the first parameter:

```typescript
export function useEditorExtensions(
  noteId: string,
  yDoc: Y.Doc,
  yXmlFragment: Y.XmlFragment,
  awareness: Awareness | null,
  currentUser: CollaborativeUser
): AnyExtension[] {
  return useMemo(() => {
    const imageUploadProvider = createImageUploadProvider(() => noteId);
    const extensions: AnyExtension[] = [
      ...createBaseExtensions({ disableHistory: true }),
      AIBlockNode.configure({ provider: aiBlockProvider }),
      ImageNode,
      ImageUpload.configure({
        provider: imageUploadProvider,
        onError: (error) => {
          logger.error('ImageUpload: provider failed', { error });
          toast.error('No se pudo subir la imagen');
        },
      }),
      Collaboration.configure({ document: yDoc, fragment: yXmlFragment }),
      // ...rest unchanged (SlashCommands, GhostText)
    ];
    // ...awareness block unchanged
    return extensions;
  }, [
    noteId,
    yDoc,
    yXmlFragment,
    awareness,
    currentUser.name,
    currentUser.color,
  ]);
}
```

- [ ] **Step 3: Update the caller to pass `noteId`**

Find the `useEditorExtensions(` call site (in `CollaborativeEditor.tsx` / `useCollaborativeEditor`) and pass `noteId` as the new first argument. Run a search:

Run: `grep -rn "useEditorExtensions(" apps/notes/src`
Then update each call to `useEditorExtensions(noteId, yDoc, yXmlFragment, awareness, currentUser)`.

- [ ] **Step 4: Typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/notes/src/components/editor/
git commit -m "feat(notes): wire image node and upload provider into editor"
```

---

### Task 13: Slash command, toolbar button, file picker, i18n

**Files:**

- Create: `apps/notes/src/components/editor/image/useImagePicker.ts`
- Modify: `apps/notes/src/components/editor/ai/slash-commands.config.ts`
- Modify: `packages/editor/src/editor.config.ts`
- Modify: i18n locale files (`en` + `es`) — find with `grep -rln "ai.slash.heading1" --include=*.json`

- [ ] **Step 1: File picker helper (opens native picker / camera on mobile)**

`useImagePicker.ts`:

```typescript
import { useCallback } from 'react';

import { ACCEPTED_IMAGE_TYPES } from '@knowtis/editor';

export function openImagePicker(onPick: (file: File) => void): void {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = ACCEPTED_IMAGE_TYPES.join(',');
  input.onchange = () => {
    const file = input.files?.[0];
    if (file) {
      onPick(file);
    }
  };
  input.click();
}

export function useImagePicker(): (onPick: (file: File) => void) => void {
  return useCallback(openImagePicker, []);
}
```

> The picker hands a `File` to the same upload path. The simplest integration: expose a global editor command. Add a thin command on `ImageUpload` is overkill; instead, the slash/toolbar actions call `openImagePicker` and then dispatch through the editor by reusing the plugin's paste path. Since the plugin's `startUpload` is internal, expose a command from `ImageUpload`: add to `image-upload.ts` `addCommands()` returning `uploadImageFile: (file: File) => () => { startUpload(file, editor.state.selection.from); return true; }`. **If you prefer to keep the plugin command-free**, have the slash/toolbar action insert via the provider directly using `createImageUploadProvider` + `editor.commands.setImage`. Pick one; the command approach is cleaner — add it now:

In `packages/editor/src/extensions/image/image-upload.ts`, refactor `startUpload` to be reachable from a command (move it into `addCommands` scope or store on the extension), and add:

```typescript
  addCommands() {
    return {
      uploadImageFile:
        (file: File) =>
        () => {
          // call the same startUpload(file, this.editor.state.selection.from)
          return true;
        },
    };
  },
```

with the matching `declare module '@tiptap/core'` command typing. Re-run `nx test editor --testPathPattern=image-upload` (still PASS — helper unchanged).

- [ ] **Step 2: Add the `/imagen` slash command**

In `apps/notes/src/components/editor/ai/slash-commands.config.ts`, import `Image as ImageIcon` from `lucide-react` and `openImagePicker` from `../image/useImagePicker`, then add to `FORMATTING_SLASH_COMMANDS`:

```typescript
  {
    id: 'image',
    icon: ImageIcon,
    labelKey: 'ai.slash.image',
    descriptionKey: 'ai.slash.imageDesc',
    group: 'formatting',
    keywords: ['image', 'photo', 'picture', 'imagen', 'foto'],
    action: (editor, range) => {
      editor.chain().focus().deleteRange(range).run();
      openImagePicker((file) => editor.commands.uploadImageFile(file));
    },
  },
```

- [ ] **Step 3: Add the toolbar button**

In `packages/editor/src/editor.config.ts`, the toolbar config lives in the editor package and must NOT import from `apps/notes`. Add a new toolbar item **type** for image (consistent with `table-insert`) and handle the picker where the toolbar renders, OR expose an `onAddImage` callback like the existing `onVoiceNote`/`onAskAI` pattern. Use the callback pattern: add `{ type: 'image-button' }` to the union + `TOOLBAR_TOOLS`, and in `EditorToolbar.tsx` render it wired to a new `onAddImage` prop. Then in the app's toolbar usage, pass `onAddImage={() => openImagePicker((file) => editor.commands.uploadImageFile(file))}`.

Add the config type + entry:

```typescript
export interface ToolbarImageConfig {
  type: 'image-button';
}
// add ToolbarImageConfig to the ToolbarItemConfig union
```

Insert into `TOOLBAR_TOOLS` near `table-insert`:

```typescript
  { type: 'image-button' },
```

Wire `onAddImage` through `EditorToolbar` (mirror how `onVoiceNote`/`onAskAI` are threaded). Render an `ImageIcon` `ToolbarButton` calling `onAddImage`.

- [ ] **Step 4: Add i18n strings**

In each `notes.json` locale file, add (en):

```json
"ai.slash.image": "Image",
"ai.slash.imageDesc": "Upload an image"
```

and (es):

```json
"ai.slash.image": "Imagen",
"ai.slash.imageDesc": "Subir una imagen"
```

- [ ] **Step 5: Typecheck + lint + build**

Run: `pnpm typecheck && nx lint editor && nx lint notes`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/notes packages/editor
git commit -m "feat(editor): add /imagen slash command and toolbar image button"
```

---

## PHASE 5 — Verification

### Task 14: End-to-end manual verification

- [ ] **Step 1: Configure the Blob store**

Create a Blob store in the Vercel dashboard (linked to the `notes` project), copy its `BLOB_READ_WRITE_TOKEN`, and set `VERCEL_BLOB_READ_WRITE_TOKEN` in `apps/api/.env`. For deploy, add the same var to Railway.

- [ ] **Step 2: Boot the stack**

Run: `pnpm docker:up && pnpm dev:all`
Expected: API on :3333, notes on :4200, no startup errors.

- [ ] **Step 3: Desktop paste/drop**

Open a note. Paste an image from the clipboard → "Subiendo imagen…" placeholder appears → swaps to the rendered image. Drag an image file onto the editor → same. Confirm in `pnpm db:studio` a `note_images` row exists and the URL loads in a new tab.

- [ ] **Step 4: Slash + toolbar + mobile**

Type `/imagen` → native picker opens → pick a file → image inserts. Click the toolbar image button → same. Switch the browser to a mobile viewport (or real device) → the toolbar button opens the native picker/camera.

- [ ] **Step 5: Caption + alt**

Add a caption under the image (figcaption); reload the note and confirm it persists. Select the image, edit alt text, inspect the `<img alt>` in devtools.

- [ ] **Step 6: Collaboration**

Open the same note in a second browser/user. Upload in window A; confirm window B shows the finished image (never a broken `blob:` URL or a stuck placeholder).

- [ ] **Step 7: Authorization**

As a viewer-only user (or via curl with a non-writer token), `POST /notes/:id/images` → expect 403. Oversized (>10 MB) or non-image → expect 400.

- [ ] **Step 8: Cleanup**

Delete a note that has images. Confirm via the Vercel Blob dashboard (or `list()`) that its blobs are gone and `note_images` rows are removed.

- [ ] **Step 9: Final checks**

Run: `pnpm lint && pnpm typecheck && pnpm test:run`
Expected: all PASS. Then open a PR.

---

## Self-Review Notes

- **Spec coverage:** entries (T12/T13), client compression+resize+gif passthrough (T11), public blob + note-scoped path (T3), figure node + caption + editable alt (T9), server-upload transport (T5), server-side authz + validation (T5), local-only placeholder for collaboration (T10), orphan cleanup on note delete (T6), env/security (T1). All present.
- **Known version-sensitive spots** flagged inline for Context7 verification: `@vercel/blob` `put`/`del` option names (T3), Tiptap v3 `NodeViewProps`/`ReactNodeViewRenderer` (T9), ProseMirror `Decoration`/`DecorationSet.find` predicate + widget spec lookup (T10).
- **Integration points to confirm by reading the cited sibling file** (not placeholders — concrete instructions): DB `db` injection token in `drizzle-note-read.repository.ts` (T4); update-endpoint decorator stack in `notes.controller.ts` (T5); `useEditorExtensions` call sites (T12); `onVoiceNote`/`onAskAI` threading in `EditorToolbar.tsx` (T13); i18n file paths (T13).
