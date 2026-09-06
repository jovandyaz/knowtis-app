import { UserId } from '@jovandyaz/auth/server';
import { ConfigModule } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import { eq, inArray } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { PERMISSION } from '@knowtis/shared-types';

import { validateEnv } from '../../../../config/env.config';
import {
  DATABASE_CONNECTION,
  DatabaseModule,
  notePermissions,
  notes,
  noteTags,
  tags,
  users,
  type Database,
} from '../../../../database';
import { DB_AVAILABLE } from '../../../../test-support/database';
import { TagPath } from '../../domain/value-objects/tag-path.vo';
import { DrizzleTagRepository } from './drizzle-tag.repository';

const OWNER = '00000000-0000-4000-8000-000000000131';
const OTHER_OWNER = '00000000-0000-4000-8000-000000000132';

const NOTE_A = '00000000-0000-4000-8000-000000000133';
const NOTE_B = '00000000-0000-4000-8000-000000000134';
const NOTE_SHARED = '00000000-0000-4000-8000-000000000135';
const NOTE_UNREACHABLE = '00000000-0000-4000-8000-000000000136';
const NOTE_DELETED = '00000000-0000-4000-8000-000000000137';

const NOTE_IDS = [NOTE_A, NOTE_B, NOTE_SHARED, NOTE_UNREACHABLE, NOTE_DELETED];
const USER_IDS = [OWNER, OTHER_OWNER];

const path = (raw: string) => TagPath.create(raw)._unsafeUnwrap();

describe.runIf(DB_AVAILABLE)('DrizzleTagRepository', () => {
  let moduleRef: TestingModule;
  let db: Database;
  let repo: DrizzleTagRepository;
  const ownerId = UserId.create(OWNER)._unsafeUnwrap();

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          validate: validateEnv,
          envFilePath: ['.env.local', '.env'],
        }),
        DatabaseModule,
      ],
    }).compile();
    db = moduleRef.get<Database>(DATABASE_CONNECTION);
    repo = new DrizzleTagRepository(db);

    for (const id of USER_IDS) {
      await db
        .insert(users)
        .values({
          id,
          email: `e-${id}@test.local`,
          name: 'U',
          isAnonymous: true,
        })
        .onConflictDoNothing();
    }
  });

  beforeEach(async () => {
    await db.delete(notes).where(inArray(notes.id, NOTE_IDS));
    await db.delete(tags).where(inArray(tags.ownerId, USER_IDS));

    await db.insert(notes).values([
      { id: NOTE_A, ownerId: OWNER, title: 'a', content: '' },
      { id: NOTE_B, ownerId: OWNER, title: 'b', content: '' },
      { id: NOTE_SHARED, ownerId: OTHER_OWNER, title: 'shared', content: '' },
      {
        id: NOTE_UNREACHABLE,
        ownerId: OTHER_OWNER,
        title: 'hidden',
        content: '',
      },
      {
        id: NOTE_DELETED,
        ownerId: OWNER,
        title: 'gone',
        content: '',
        deletedAt: new Date(),
      },
    ]);
    await db.insert(notePermissions).values({
      noteId: NOTE_SHARED,
      userId: OWNER,
      permission: PERMISSION.VIEWER,
    });
  });

  afterAll(async () => {
    await db.delete(notes).where(inArray(notes.id, NOTE_IDS));
    await db.delete(tags).where(inArray(tags.ownerId, USER_IDS));
    await db.delete(users).where(inArray(users.id, USER_IDS));
    await moduleRef.close();
  });

  it('should materialize every ancestor of a deep path', async () => {
    await repo.ensurePaths(ownerId, [path('work/projects/alpha')]);

    const rows = await db
      .select({ path: tags.path })
      .from(tags)
      .where(eq(tags.ownerId, OWNER))
      .orderBy(tags.path);

    expect(rows.map((row) => row.path)).toEqual([
      'work',
      'work/projects',
      'work/projects/alpha',
    ]);
  });

  it('should return the leaf id for each requested path, in order', async () => {
    const ids = await repo.ensurePaths(ownerId, [path('a/b'), path('c')]);

    const rows = await db
      .select({ id: tags.id, path: tags.path })
      .from(tags)
      .where(inArray(tags.id, ids));
    const byId = new Map(rows.map((row) => [row.id, row.path]));

    expect(ids).toHaveLength(2);
    expect(byId.get(ids[0] as string)).toBe('a/b');
    expect(byId.get(ids[1] as string)).toBe('c');
  });

  it('should reuse existing rows instead of duplicating them', async () => {
    const first = await repo.ensurePaths(ownerId, [path('work/alpha')]);
    const second = await repo.ensurePaths(ownerId, [path('work/alpha')]);

    expect(second).toEqual(first);
  });

  it('should replace a note tag set rather than append to it', async () => {
    const [first] = await repo.ensurePaths(ownerId, [path('one')]);
    await repo.replaceNoteTags(NOTE_A, [first as string]);

    const [second] = await repo.ensurePaths(ownerId, [path('two')]);
    await repo.replaceNoteTags(NOTE_A, [second as string]);

    const byNote = await repo.findPathsByNotes([NOTE_A]);
    expect(byNote.get(NOTE_A)).toEqual(['two']);
  });

  it('should count a note once for an ancestor even when it also carries the descendant', async () => {
    const ids = await repo.ensurePaths(ownerId, [
      path('work'),
      path('work/alpha'),
    ]);
    await repo.replaceNoteTags(NOTE_A, ids);

    const tree = await repo.findTreeByOwner(ownerId);

    expect(tree.find((node) => node.path === 'work')?.noteCount).toBe(1);
    expect(tree.find((node) => node.path === 'work/alpha')?.noteCount).toBe(1);
  });

  it('should roll descendant notes up into the ancestor count', async () => {
    const [alpha] = await repo.ensurePaths(ownerId, [path('work/alpha')]);
    const [beta] = await repo.ensurePaths(ownerId, [path('work/beta')]);
    await repo.replaceNoteTags(NOTE_A, [alpha as string]);
    await repo.replaceNoteTags(NOTE_B, [beta as string]);

    const tree = await repo.findTreeByOwner(ownerId);

    expect(tree.find((node) => node.path === 'work')?.noteCount).toBe(2);
    expect(tree.find((node) => node.path === 'work/alpha')?.noteCount).toBe(1);
  });

  it('should count a shared note but never an inaccessible or deleted one', async () => {
    const [tagId] = await repo.ensurePaths(ownerId, [path('mixed')]);
    for (const noteId of [
      NOTE_A,
      NOTE_SHARED,
      NOTE_UNREACHABLE,
      NOTE_DELETED,
    ]) {
      await db
        .insert(noteTags)
        .values({ noteId, tagId: tagId as string })
        .onConflictDoNothing();
    }

    const tree = await repo.findTreeByOwner(ownerId);

    expect(tree.find((node) => node.path === 'mixed')?.noteCount).toBe(2);
  });

  it('should rewrite descendant paths when a branch is renamed', async () => {
    await repo.ensurePaths(ownerId, [path('work/projects/alpha')]);
    const branch = (await repo.findTreeByOwner(ownerId)).find(
      (node) => node.path === 'work'
    );
    const record = await repo.findById(branch?.id as string);

    const renamed = await repo.renameBranch(record as never, path('job'));
    expect(renamed.isOk()).toBe(true);

    const rows = await db
      .select({ path: tags.path })
      .from(tags)
      .where(eq(tags.ownerId, OWNER))
      .orderBy(tags.path);
    expect(rows.map((row) => row.path)).toEqual([
      'job',
      'job/projects',
      'job/projects/alpha',
    ]);
  });

  it('should report the path a rename would claim from another branch', async () => {
    await repo.ensurePaths(ownerId, [path('work/alpha'), path('job')]);
    const record = await repo.findById(
      (await repo.findTreeByOwner(ownerId)).find((node) => node.path === 'work')
        ?.id as string
    );

    const collision = await repo.findPathCollision(
      record as never,
      path('job')
    );

    expect(collision).toBe('job');
  });

  it('should not read the branch being renamed as its own collision', async () => {
    await repo.ensurePaths(ownerId, [path('work/alpha')]);
    const record = await repo.findById(
      (await repo.findTreeByOwner(ownerId)).find((node) => node.path === 'work')
        ?.id as string
    );

    // The target lands inside the branch being moved, so the only rows it
    // overlaps are rows the rename itself rewrites.
    const collision = await repo.findPathCollision(
      record as never,
      path('work/alpha')
    );

    expect(collision).toBeNull();
  });

  it('should not treat a same-prefixed sibling as a collision', async () => {
    await repo.ensurePaths(ownerId, [path('work'), path('workshop')]);
    const record = await repo.findById(
      (await repo.findTreeByOwner(ownerId)).find((node) => node.path === 'work')
        ?.id as string
    );

    const collision = await repo.findPathCollision(
      record as never,
      path('works')
    );

    expect(collision).toBeNull();
  });

  it('should round-trip a palette colour and drop one outside the palette', async () => {
    const [tagId] = await repo.ensurePaths(ownerId, [path('work')]);

    await repo.recolor(tagId as string, 'green');
    const colored = await repo.findById(tagId as string);

    await db
      .update(tags)
      .set({ color: '#f5f5f5' })
      .where(eq(tags.id, tagId as string));
    const legacy = await repo.findById(tagId as string);

    expect(colored?.color).toBe('green');
    expect(legacy?.color).toBeNull();
  });

  it('should answer with a conflict when the index refuses the new path', async () => {
    await repo.ensurePaths(ownerId, [path('work/alpha'), path('job')]);
    const record = await repo.findById(
      (await repo.findTreeByOwner(ownerId)).find((node) => node.path === 'work')
        ?.id as string
    );

    // Straight to the write: this is the path a rename takes when another
    // writer claims the target between the collision check and the update.
    const renamed = await repo.renameBranch(record as never, path('job'));

    expect(renamed._unsafeUnwrapErr().code).toBe('TAG_CONFLICT');
  });

  it('should leave the branch untouched when the rename is refused', async () => {
    await repo.ensurePaths(ownerId, [path('work/alpha'), path('job')]);
    const record = await repo.findById(
      (await repo.findTreeByOwner(ownerId)).find((node) => node.path === 'work')
        ?.id as string
    );

    await repo.renameBranch(record as never, path('job'));

    const rows = await db
      .select({ path: tags.path })
      .from(tags)
      .where(eq(tags.ownerId, OWNER))
      .orderBy(tags.path);
    expect(rows.map((row) => row.path)).toEqual(['job', 'work', 'work/alpha']);
  });

  it('should keep the note when its tag branch is deleted', async () => {
    const [alpha] = await repo.ensurePaths(ownerId, [path('work/alpha')]);
    await repo.replaceNoteTags(NOTE_A, [alpha as string]);
    const root = (await repo.findTreeByOwner(ownerId)).find(
      (node) => node.path === 'work'
    );

    await repo.deleteBranch((await repo.findById(root?.id as string)) as never);

    const remaining = await db
      .select({ path: tags.path })
      .from(tags)
      .where(eq(tags.ownerId, OWNER));
    const note = await db.select().from(notes).where(eq(notes.id, NOTE_A));

    expect(remaining).toHaveLength(0);
    expect(note).toHaveLength(1);
  });

  it('should not leak another owner tags into the tree', async () => {
    const otherId = UserId.create(OTHER_OWNER)._unsafeUnwrap();
    await repo.ensurePaths(otherId, [path('theirs')]);
    await repo.ensurePaths(ownerId, [path('mine')]);

    const tree = await repo.findTreeByOwner(ownerId);

    expect(tree.map((node) => node.path)).toEqual(['mine']);
  });
});
