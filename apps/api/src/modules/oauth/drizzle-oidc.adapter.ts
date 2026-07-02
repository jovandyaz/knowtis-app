import { and, eq, sql } from 'drizzle-orm';

import {
  oauthPayloads,
  type Database,
  type OauthPayloadRow,
} from '../../database';

type AdapterPayload = Record<string, unknown>;

/**
 * Returns the ids of every stored Grant for an account+client pair. Grant rows
 * keep accountId/clientId only inside the JSON payload (their grant_id column
 * is null — the row id IS the grant id), so the lookup goes through the payload.
 */
export async function findGrantIdsByAccountAndClient(
  db: Database,
  accountId: string,
  clientId: string
): Promise<string[]> {
  const rows = await db
    .select({ id: oauthPayloads.id })
    .from(oauthPayloads)
    .where(
      and(
        eq(oauthPayloads.model, 'Grant'),
        sql`${oauthPayloads.payload} ->> 'accountId' = ${accountId}`,
        sql`${oauthPayloads.payload} ->> 'clientId' = ${clientId}`
      )
    );
  return rows.map((row) => row.id);
}

function optionalString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

/**
 * Drizzle-backed storage adapter for node-oidc-provider, one instance per model.
 *
 * `find`/`findByUid`/`findByUserCode` return the stored payload or `undefined`
 * when the row is missing or expired. A consumed row is still returned, with a
 * `consumed` epoch-seconds property merged in — the provider relies on this to
 * detect refresh-token/authorization-code reuse, so consumed rows must NOT be
 * filtered out. `revokeByGrantId` deletes across all models sharing the grantId.
 */
export class DrizzleOidcAdapter {
  constructor(
    private readonly db: Database,
    private readonly model: string
  ) {}

  async upsert(
    id: string,
    payload: AdapterPayload,
    expiresIn?: number
  ): Promise<void> {
    const grantId = optionalString(payload['grantId']);
    const userCode = optionalString(payload['userCode']);
    const uid = optionalString(payload['uid']);
    const expiresAt = expiresIn
      ? new Date(Date.now() + expiresIn * 1000)
      : null;

    await this.db
      .insert(oauthPayloads)
      .values({
        model: this.model,
        id,
        payload,
        grantId,
        userCode,
        uid,
        expiresAt,
        consumedAt: null,
      })
      .onConflictDoUpdate({
        target: [oauthPayloads.model, oauthPayloads.id],
        set: { payload, grantId, userCode, uid, expiresAt, consumedAt: null },
      })
      .returning({ id: oauthPayloads.id });
  }

  async find(id: string): Promise<AdapterPayload | undefined> {
    const [row] = await this.db
      .select()
      .from(oauthPayloads)
      .where(and(eq(oauthPayloads.model, this.model), eq(oauthPayloads.id, id)))
      .limit(1);
    return this.toPayload(row);
  }

  async findByUid(uid: string): Promise<AdapterPayload | undefined> {
    const [row] = await this.db
      .select()
      .from(oauthPayloads)
      .where(
        and(eq(oauthPayloads.model, this.model), eq(oauthPayloads.uid, uid))
      )
      .limit(1);
    return this.toPayload(row);
  }

  async findByUserCode(userCode: string): Promise<AdapterPayload | undefined> {
    const [row] = await this.db
      .select()
      .from(oauthPayloads)
      .where(
        and(
          eq(oauthPayloads.model, this.model),
          eq(oauthPayloads.userCode, userCode)
        )
      )
      .limit(1);
    return this.toPayload(row);
  }

  async consume(id: string): Promise<void> {
    await this.db
      .update(oauthPayloads)
      .set({ consumedAt: new Date() })
      .where(and(eq(oauthPayloads.model, this.model), eq(oauthPayloads.id, id)))
      .returning({ id: oauthPayloads.id });
  }

  async destroy(id: string): Promise<void> {
    await this.db
      .delete(oauthPayloads)
      .where(and(eq(oauthPayloads.model, this.model), eq(oauthPayloads.id, id)))
      .returning({ id: oauthPayloads.id });
  }

  async revokeByGrantId(grantId: string): Promise<void> {
    await this.db
      .delete(oauthPayloads)
      .where(eq(oauthPayloads.grantId, grantId))
      .returning({ id: oauthPayloads.id });
  }

  private toPayload(
    row: OauthPayloadRow | undefined
  ): AdapterPayload | undefined {
    if (!row) {
      return undefined;
    }
    if (row.expiresAt && row.expiresAt.getTime() <= Date.now()) {
      return undefined;
    }
    if (row.consumedAt) {
      return {
        ...row.payload,
        consumed: Math.floor(row.consumedAt.getTime() / 1000),
      };
    }
    return row.payload;
  }
}

export function createAdapterFactory(
  db: Database
): (model: string) => DrizzleOidcAdapter {
  return (model: string) => new DrizzleOidcAdapter(db, model);
}
