import { randomUUID } from 'node:crypto';

import { eq, inArray } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import * as schema from '../../../database/schema';
import { notePermissions, notes } from '../../../database/schema/notes.schema';
import { users } from '../../../database/schema/users.schema';

export async function createSharingFixture() {
  const databaseUrl = process.env['DATABASE_URL'];
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required');
  }
  const client = postgres(databaseUrl, { max: 5 });
  const db = drizzle(client, { schema });
  const ids = {
    owner: randomUUID(),
    editor: randomUUID(),
    viewer: randomUUID(),
    target: randomUUID(),
    stranger: randomUUID(),
    anonymous: randomUUID(),
    note: randomUUID(),
  };
  const userIds: string[] = [
    ids.owner,
    ids.editor,
    ids.viewer,
    ids.target,
    ids.stranger,
    ids.anonymous,
  ];
  const close = async () => {
    try {
      await db.delete(notes).where(eq(notes.id, ids.note));
      await db.delete(users).where(inArray(users.id, userIds));
    } finally {
      await client.end();
    }
  };
  try {
    await db.insert(users).values(
      userIds.map((id, index) => ({
        id,
        name: index === 0 ? 'ZZ Owner' : 'Same Name',
        email: `s1-${index}-${id}@example.test`,
        isAnonymous: id === ids.anonymous,
        emailVerifiedAt: new Date(),
      }))
    );
    await db.insert(notes).values({
      id: ids.note,
      ownerId: ids.owner,
      title: 'Sharing contract',
      content: '<p>Existing note content</p>',
      editorsCanShare: true,
      generalAccess: 'anyone_with_link',
      generalAccessPermission: 'editor',
      shareToken: `s1-${ids.note}`,
    });
    await db.insert(notePermissions).values([
      { noteId: ids.note, userId: ids.editor, permission: 'editor' },
      { noteId: ids.note, userId: ids.viewer, permission: 'viewer' },
    ]);
    return {
      client,
      db,
      ids,
      close,
      email: (id: string) => `s1-${userIds.indexOf(id)}-${id}@example.test`,
    };
  } catch (error) {
    await close();
    throw error;
  }
}
export type SharingFixture = Awaited<ReturnType<typeof createSharingFixture>>;
