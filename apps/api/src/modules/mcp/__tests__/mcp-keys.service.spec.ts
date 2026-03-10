import { describe, expect, it } from 'vitest';

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
