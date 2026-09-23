import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';

import { validateEnv } from '../config/env.config';
import {
  DATABASE_CONNECTION,
  DatabaseModule,
  type Database,
} from '../database/database.module';

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
class ScriptContextModule {}

/** Runs `work` against the database the validated api env names, closing the connection afterwards. */
export async function withScriptDatabase<T>(
  work: (db: Database) => Promise<T>
): Promise<T> {
  const app = await NestFactory.createApplicationContext(ScriptContextModule, {
    logger: ['error', 'warn'],
  });
  try {
    return await work(app.get<Database>(DATABASE_CONNECTION));
  } finally {
    await app.close();
  }
}
