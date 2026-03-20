/**
 * Field-level encryption utilities for sensitive data at rest.
 *
 * Uses AES-256-GCM with a random IV per encryption operation.
 * The encrypted output is stored as: iv:authTag:ciphertext (hex-encoded).
 *
 * Requires ENCRYPTION_KEY env var (64-char hex string = 32 bytes).
 */

import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16; // 128-bit IV for GCM
const AUTH_TAG_LENGTH = 16; // 128-bit auth tag

/**
 * Get the encryption key from environment.
 * Returns null if not configured (encryption disabled).
 */
function getKey(): Buffer | null {
  const hex = process.env.ENCRYPTION_KEY;
  if (!hex) return null;
  if (hex.length !== 64) {
    throw new Error(
      'ENCRYPTION_KEY must be a 64-character hex string (32 bytes). ' +
        "Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"",
    );
  }
  return Buffer.from(hex, 'hex');
}

/**
 * Encrypt a plaintext string.
 * Returns the encrypted value as "iv:authTag:ciphertext" (hex-encoded).
 * Returns the plaintext unchanged if no ENCRYPTION_KEY is configured.
 */
export function encrypt(plaintext: string): string {
  const key = getKey();
  if (!key) return plaintext;

  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag();

  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

/**
 * Decrypt a value produced by encrypt().
 * Expects format "iv:authTag:ciphertext" (hex-encoded).
 * Returns the original plaintext unchanged if no ENCRYPTION_KEY is configured
 * or if the value doesn't match the encrypted format.
 */
export function decrypt(encryptedValue: string): string {
  const key = getKey();
  if (!key) return encryptedValue;

  // If it doesn't look like our format, return as-is (legacy plaintext)
  const parts = encryptedValue.split(':');
  if (parts.length !== 3) return encryptedValue;

  const [ivHex, authTagHex, ciphertext] = parts;
  if (!ivHex || !authTagHex || !ciphertext) return encryptedValue;

  // Validate hex lengths
  if (ivHex.length !== IV_LENGTH * 2 || authTagHex.length !== AUTH_TAG_LENGTH * 2) {
    return encryptedValue;
  }

  try {
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(ciphertext, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch {
    // If decryption fails (wrong key, corrupted data), return as-is
    return encryptedValue;
  }
}

/**
 * Check if encryption is configured.
 */
export function isEncryptionEnabled(): boolean {
  return !!process.env.ENCRYPTION_KEY;
}
