import { Global, Inject, Module, type OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres, { type Sql } from 'postgres';

import * as schema from './schema';

export const DATABASE_CONNECTION = 'DATABASE_CONNECTION';
/** Raw postgres-js client. Inject only to pin work to one connection; everything else uses `DATABASE_CONNECTION`. */
export const DATABASE_CLIENT = 'DATABASE_CLIENT';

export type Database = PostgresJsDatabase<typeof schema>;

@Global()
@Module({
  providers: [
    {
      provide: DATABASE_CLIENT,
      useFactory: (configService: ConfigService): Sql => {
        return postgres(configService.getOrThrow<string>('DATABASE_URL'), {
          max: 10,
          idle_timeout: 20,
          connect_timeout: 10,
        });
      },
      inject: [ConfigService],
    },
    {
      provide: DATABASE_CONNECTION,
      useFactory: (client: Sql): Database => {
        return drizzle(client, { schema });
      },
      inject: [DATABASE_CLIENT],
    },
  ],
  exports: [DATABASE_CONNECTION, DATABASE_CLIENT],
})
export class DatabaseModule implements OnModuleDestroy {
  constructor(@Inject(DATABASE_CLIENT) private readonly client: Sql) {}

  async onModuleDestroy() {
    await this.client.end();
  }
}
