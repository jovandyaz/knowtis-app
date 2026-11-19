/* eslint-disable no-console */
import { USER_ROLE } from '@jovandyaz/auth';
import type { ConfigService } from '@nestjs/config';
import { config as loadEnv } from 'dotenv';
import { eq } from 'drizzle-orm';

import type { Database } from '../database';
import { users } from '../database/schema';
import { BcryptPasswordHasher } from '../modules/auth/infrastructure/security/bcrypt-password-hasher';
import { withScriptDatabase } from './script-context';

// validateEnv strips keys outside the app schema, so ConfigService never sees these.
loadEnv({ path: ['.env.local', '.env'], quiet: true });
const email = process.env['ADMIN_EMAIL']?.trim();
const password = process.env['ADMIN_PASSWORD'];

async function seedAdmin(
  db: Database,
  config: ConfigService,
  email: string,
  password: string
): Promise<void> {
  const existing = await db.query.users.findFirst({
    where: eq(users.email, email),
  });

  if (existing) {
    if (existing.role === USER_ROLE.ADMIN) {
      console.log(`User ${email} is already an admin. No changes made.`);
      return;
    }
    await db
      .update(users)
      .set({ role: USER_ROLE.ADMIN })
      .where(eq(users.id, existing.id));
    console.log(`User ${email} promoted to admin.`);
    return;
  }

  // tsx emits no decorator metadata, so the hasher is built by hand instead of injected.
  const hashed = await new BcryptPasswordHasher(config).hash(password);
  if (hashed.isErr()) {
    throw new Error('Could not hash the admin password.', {
      cause: hashed.error,
    });
  }
  await db.insert(users).values({
    email,
    name: email.split('@')[0],
    passwordHash: hashed.value,
    provider: 'local',
    role: USER_ROLE.ADMIN,
    emailVerifiedAt: new Date(),
  });
  console.log(`Admin user ${email} created.`);
}

if (!email || !password) {
  console.error(
    'Error: ADMIN_EMAIL and ADMIN_PASSWORD are required, in the environment or apps/api/.env.'
  );
  console.error(
    'Usage: ADMIN_EMAIL=admin@example.com ADMIN_PASSWORD=Secret123 pnpm nx run api:seed-admin'
  );
  process.exit(1);
}

withScriptDatabase((db, config) =>
  seedAdmin(db, config, email, password)
).catch((error: unknown) => {
  console.error('Failed to seed admin:', error);
  process.exit(1);
});
