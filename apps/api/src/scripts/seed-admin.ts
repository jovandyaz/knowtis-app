/* eslint-disable no-console */
import { USER_ROLE } from '@jovandyaz/auth';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { eq } from 'drizzle-orm';

import { validateEnv } from '../config/env.config';
import { DATABASE_CONNECTION, DatabaseModule } from '../database';
import type { Database } from '../database';
import { users } from '../database/schema';
import { BcryptPasswordHasher } from '../modules/auth/infrastructure/security/bcrypt-password-hasher';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
      envFilePath: ['.env.local', '.env'],
    }),
    DatabaseModule,
  ],
})
class SeedModule {}

async function seedAdmin() {
  const email = process.env['ADMIN_EMAIL'];
  const password = process.env['ADMIN_PASSWORD'];

  if (!email || !password) {
    console.error(
      'Error: ADMIN_EMAIL and ADMIN_PASSWORD environment variables are required.'
    );
    console.error(
      'Usage: ADMIN_EMAIL=admin@example.com ADMIN_PASSWORD=Secret123 pnpm nx run api:seed-admin'
    );
    process.exit(1);
  }

  const app = await NestFactory.createApplicationContext(SeedModule, {
    logger: ['error', 'warn'],
  });

  try {
    const db = app.get<Database>(DATABASE_CONNECTION);

    const existing = await db.query.users.findFirst({
      where: eq(users.email, email),
    });

    if (existing) {
      if (existing.role === USER_ROLE.ADMIN) {
        console.log(`User ${email} is already an admin. No changes made.`);
      } else {
        await db
          .update(users)
          .set({ role: USER_ROLE.ADMIN })
          .where(eq(users.id, existing.id));
        console.log(`User ${email} promoted to admin.`);
      }
    } else {
      // tsx emits no decorator metadata, so the hasher is built by hand instead of injected.
      const hasher = new BcryptPasswordHasher(app.get(ConfigService));
      const hashed = await hasher.hash(password);
      if (hashed.isErr()) {
        throw new Error('Could not hash the admin password.');
      }
      const passwordHash = hashed.value;
      await db.insert(users).values({
        email,
        name: email.split('@')[0],
        passwordHash,
        provider: 'local',
        role: USER_ROLE.ADMIN,
        emailVerifiedAt: new Date(),
      });
      console.log(`Admin user ${email} created.`);
    }
  } finally {
    await app.close();
  }
}

seedAdmin().catch((error) => {
  console.error('Failed to seed admin:', error);
  process.exit(1);
});
