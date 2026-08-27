import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { and, eq } from 'drizzle-orm';

import { DATABASE_CONNECTION, mcpApiKeys, type Database } from '../../database';
import { VerifiedIdentityPolicy } from '../users/verified-identity.policy';
import { MCP_SCOPES, type McpScopeCsv } from './mcp-token';

interface KeyParts {
  fullKey: string;
  prefix: string;
  hash: string;
}

@Injectable()
export class McpKeysService {
  private readonly logger = new Logger(McpKeysService.name);

  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly db: Database,
    private readonly configService: ConfigService,
    private readonly verifiedIdentity: VerifiedIdentityPolicy
  ) {}

  /**
   * Generate a new API key with prefix and hash.
   * Key format: knowtis_mcp_{env}_{random}
   */
  static generateKeyParts(env: string): KeyParts {
    const random = randomBytes(32).toString('base64url');
    const fullKey = `knowtis_mcp_${env}_${random}`;
    const prefix = fullKey.slice(0, 24);
    const hash = McpKeysService.hashKey(fullKey);

    return { fullKey, prefix, hash };
  }

  /**
   * SHA-256 hash of a key (hex encoded). Deliberately keyless, unlike the shared
   * TokenHasher: MCP keys carry 32 random bytes, so there is nothing to
   * precompute, and rekeying would orphan live keys users hold in their clients.
   */
  static hashKey(key: string): string {
    return createHash('sha256').update(key).digest('hex');
  }

  /**
   * Verify a key against a stored hash using timing-safe comparison.
   */
  static verifyKey(key: string, storedHash: string): boolean {
    const keyHash = McpKeysService.hashKey(key);

    try {
      return timingSafeEqual(
        Buffer.from(keyHash, 'hex'),
        Buffer.from(storedHash, 'hex')
      );
    } catch (error) {
      new Logger(McpKeysService.name).warn(
        `Key verification failed (likely malformed hash): ${error instanceof Error ? error.message : String(error)}`
      );
      return false;
    }
  }

  /**
   * Create a new MCP API key for a user.
   * Returns the full key (shown once) along with the persisted record.
   */
  async create(
    userId: string,
    name: string,
    scopes: McpScopeCsv = MCP_SCOPES.READ
  ) {
    await this.verifiedIdentity.assertVerified(
      userId,
      'Verify your email address to create API keys'
    );

    const env =
      this.configService.get('NODE_ENV') === 'production' ? 'live' : 'test';
    const { fullKey, prefix, hash } = McpKeysService.generateKeyParts(env);

    const [record] = await this.db
      .insert(mcpApiKeys)
      .values({
        userId,
        name,
        keyHash: hash,
        keyPrefix: prefix,
        scopes,
      })
      .returning();

    this.logger.log(`MCP API key created for user ${userId}: ${prefix}...`);

    return { key: fullKey, record };
  }

  /**
   * List all active MCP API keys for a user (without hash).
   */
  async list(userId: string) {
    return this.db
      .select({
        id: mcpApiKeys.id,
        name: mcpApiKeys.name,
        keyPrefix: mcpApiKeys.keyPrefix,
        scopes: mcpApiKeys.scopes,
        lastUsedAt: mcpApiKeys.lastUsedAt,
        createdAt: mcpApiKeys.createdAt,
        expiresAt: mcpApiKeys.expiresAt,
      })
      .from(mcpApiKeys)
      .where(and(eq(mcpApiKeys.userId, userId), eq(mcpApiKeys.isActive, true)));
  }

  /**
   * Revoke (soft-delete) an MCP API key.
   */
  async revoke(userId: string, keyId: string) {
    const [result] = await this.db
      .update(mcpApiKeys)
      .set({ isActive: false })
      .where(
        and(
          eq(mcpApiKeys.id, keyId),
          eq(mcpApiKeys.userId, userId),
          eq(mcpApiKeys.isActive, true)
        )
      )
      .returning({ id: mcpApiKeys.id });

    if (!result) {
      this.logger.warn(
        `Failed to revoke MCP key ${keyId} for user ${userId}: not found or already revoked`
      );
    }

    return result ?? null;
  }

  /**
   * Find an active key record by its prefix (for authentication lookup).
   */
  async findByPrefix(prefix: string) {
    const [result] = await this.db
      .select()
      .from(mcpApiKeys)
      .where(
        and(eq(mcpApiKeys.keyPrefix, prefix), eq(mcpApiKeys.isActive, true))
      )
      .limit(1);

    return result ?? null;
  }

  /**
   * Update the lastUsedAt timestamp for a key.
   */
  async updateLastUsed(keyId: string) {
    await this.db
      .update(mcpApiKeys)
      .set({ lastUsedAt: new Date() })
      .where(eq(mcpApiKeys.id, keyId));
  }
}
