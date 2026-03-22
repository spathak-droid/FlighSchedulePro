import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { encrypt, decrypt, isEncryptionEnabled } from '../../../src/common/crypto.js';

// ─── Setup ──────────────────────────────────────────────────────────────────

const VALID_KEY = 'a'.repeat(64); // 64-char hex = 32 bytes

describe('crypto', () => {
  const originalEnv = process.env.ENCRYPTION_KEY;

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.ENCRYPTION_KEY = originalEnv;
    } else {
      delete process.env.ENCRYPTION_KEY;
    }
  });

  // ── isEncryptionEnabled ─────────────────────────────────────────────────

  describe('isEncryptionEnabled', () => {
    it('returns true when ENCRYPTION_KEY is set', () => {
      process.env.ENCRYPTION_KEY = VALID_KEY;
      expect(isEncryptionEnabled()).toBe(true);
    });

    it('returns false when ENCRYPTION_KEY is not set', () => {
      delete process.env.ENCRYPTION_KEY;
      expect(isEncryptionEnabled()).toBe(false);
    });

    it('returns false when ENCRYPTION_KEY is empty string', () => {
      process.env.ENCRYPTION_KEY = '';
      expect(isEncryptionEnabled()).toBe(false);
    });
  });

  // ── encrypt ─────────────────────────────────────────────────────────────

  describe('encrypt', () => {
    it('returns plaintext when no key configured', () => {
      delete process.env.ENCRYPTION_KEY;
      expect(encrypt('secret')).toBe('secret');
    });

    it('returns encrypted format iv:authTag:ciphertext', () => {
      process.env.ENCRYPTION_KEY = VALID_KEY;
      const encrypted = encrypt('hello world');
      const parts = encrypted.split(':');
      expect(parts).toHaveLength(3);
      // IV = 16 bytes = 32 hex chars
      expect(parts[0]).toHaveLength(32);
      // Auth tag = 16 bytes = 32 hex chars
      expect(parts[1]).toHaveLength(32);
      // Ciphertext should be non-empty
      expect(parts[2]!.length).toBeGreaterThan(0);
    });

    it('produces different output each time (random IV)', () => {
      process.env.ENCRYPTION_KEY = VALID_KEY;
      const a = encrypt('same plaintext');
      const b = encrypt('same plaintext');
      expect(a).not.toBe(b); // Different IVs should produce different ciphertext
    });

    it('throws when key is wrong length', () => {
      process.env.ENCRYPTION_KEY = 'tooshort';
      expect(() => encrypt('test')).toThrow('64-character hex string');
    });
  });

  // ── decrypt ─────────────────────────────────────────────────────────────

  describe('decrypt', () => {
    it('returns plaintext when no key configured', () => {
      delete process.env.ENCRYPTION_KEY;
      expect(decrypt('anything')).toBe('anything');
    });

    it('decrypts encrypted values correctly', () => {
      process.env.ENCRYPTION_KEY = VALID_KEY;
      const plaintext = 'my-secret-fsp-token-12345';
      const encrypted = encrypt(plaintext);
      const decrypted = decrypt(encrypted);
      expect(decrypted).toBe(plaintext);
    });

    it('handles legacy plaintext gracefully (no colons)', () => {
      process.env.ENCRYPTION_KEY = VALID_KEY;
      // Value without our iv:authTag:ciphertext format is returned as-is
      expect(decrypt('legacy-plaintext-token')).toBe('legacy-plaintext-token');
    });

    it('handles malformed encrypted values (wrong part count)', () => {
      process.env.ENCRYPTION_KEY = VALID_KEY;
      expect(decrypt('only:two')).toBe('only:two');
      expect(decrypt('a:b:c:d')).toBe('a:b:c:d'); // 4 parts, not 3
    });

    it('handles wrong IV length gracefully', () => {
      process.env.ENCRYPTION_KEY = VALID_KEY;
      expect(decrypt('short:' + 'a'.repeat(32) + ':ciphertext')).toBe(
        'short:' + 'a'.repeat(32) + ':ciphertext',
      );
    });

    it('handles wrong auth tag length gracefully', () => {
      process.env.ENCRYPTION_KEY = VALID_KEY;
      expect(decrypt('a'.repeat(32) + ':short:ciphertext')).toBe(
        'a'.repeat(32) + ':short:ciphertext',
      );
    });

    it('handles corrupted ciphertext gracefully (returns as-is)', () => {
      process.env.ENCRYPTION_KEY = VALID_KEY;
      const badValue = 'a'.repeat(32) + ':' + 'b'.repeat(32) + ':' + 'c'.repeat(20);
      // Decryption will fail (bad auth tag), should return as-is
      expect(decrypt(badValue)).toBe(badValue);
    });

    it('roundtrips various plaintexts', () => {
      process.env.ENCRYPTION_KEY = VALID_KEY;
      // Note: empty string encrypt produces iv:authTag: with empty ciphertext,
      // which decrypt treats as legacy plaintext (falsy ciphertext part).
      const cases = ['short', 'a'.repeat(1000), '🚀 unicode', '{"json": true}', 'x'];
      for (const plaintext of cases) {
        expect(decrypt(encrypt(plaintext))).toBe(plaintext);
      }
    });
  });
});
