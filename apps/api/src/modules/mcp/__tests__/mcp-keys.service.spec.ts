import { HttpStatus } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { EMAIL_NOT_VERIFIED_CODE } from '@knowtis/shared-types';

import {
  IDENTITY_STATE,
  policyFor,
  type IdentityState,
} from '../../../test-support/verified-identity';
import { McpKeysService } from '../mcp-keys.service';

describe('McpKeysService', () => {
  describe('generateKeyParts', () => {
    it('should generate key with knowtis_mcp prefix', () => {
      const { fullKey, prefix, hash } = McpKeysService.generateKeyParts('test');
      expect(fullKey).toMatch(/^knowtis_mcp_test_/);
      expect(prefix).toBe(fullKey.slice(0, 24));
      expect(hash).toHaveLength(64); // SHA-256 hex
    });

    it('should generate unique keys each time', () => {
      const a = McpKeysService.generateKeyParts('live');
      const b = McpKeysService.generateKeyParts('live');
      expect(a.fullKey).not.toBe(b.fullKey);
    });
  });

  describe('hashKey', () => {
    it('should produce consistent SHA-256 hash', () => {
      const hash1 = McpKeysService.hashKey('test-key');
      const hash2 = McpKeysService.hashKey('test-key');
      expect(hash1).toBe(hash2);
    });
  });

  describe('verifyKey', () => {
    it('should verify matching key and hash', () => {
      const { fullKey, hash } = McpKeysService.generateKeyParts('test');
      expect(McpKeysService.verifyKey(fullKey, hash)).toBe(true);
    });

    it('should reject non-matching key', () => {
      const { hash } = McpKeysService.generateKeyParts('test');
      expect(McpKeysService.verifyKey('wrong-key', hash)).toBe(false);
    });
  });
});

describe('McpKeysService.create', () => {
  function makeService(state: IdentityState) {
    const returning = vi.fn().mockResolvedValue([{ id: 'key-1' }]);
    const values = vi.fn().mockReturnValue({ returning });
    const insert = vi.fn().mockReturnValue({ values });
    const db = { insert };
    const configService = { get: vi.fn().mockReturnValue('test') };
    const service = new McpKeysService(
      db as never,
      configService as never,
      policyFor(state)
    );
    return { service, insert };
  }

  it('mints a key for an unverified user while the gate flag is off', async () => {
    const { service, insert } = makeService(IDENTITY_STATE.GATE_OFF);

    await expect(service.create('user-1', 'laptop')).resolves.toMatchObject({
      record: { id: 'key-1' },
    });
    expect(insert).toHaveBeenCalled();
  });

  it('refuses an unverified user with EMAIL_NOT_VERIFIED and writes nothing', async () => {
    const { service, insert } = makeService(IDENTITY_STATE.UNVERIFIED);

    await expect(service.create('user-1', 'laptop')).rejects.toMatchObject({
      status: HttpStatus.FORBIDDEN,
      response: { code: EMAIL_NOT_VERIFIED_CODE },
    });
    expect(insert).not.toHaveBeenCalled();
  });

  it('mints a key for a verified user', async () => {
    const { service, insert } = makeService(IDENTITY_STATE.VERIFIED);

    const { key } = await service.create('user-1', 'laptop');

    expect(key).toMatch(/^knowtis_mcp_test_/);
    expect(insert).toHaveBeenCalled();
  });
});
