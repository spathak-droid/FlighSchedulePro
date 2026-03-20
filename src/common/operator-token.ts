/**
 * Operator FSP token storage — encrypts before write, decrypts after read.
 *
 * Centralizes all fspToken DB access so encryption is applied consistently.
 */

import { db } from '../db/index.js';
import { operators } from '../db/schema/operators.js';
import { eq } from 'drizzle-orm';
import { encrypt, decrypt } from './crypto.js';

/**
 * Store an FSP token for an operator (encrypted at rest).
 */
export async function storeOperatorToken(
  operatorId: number,
  token: string,
  expiresAt?: Date,
): Promise<void> {
  const encryptedToken = encrypt(token);
  await db
    .update(operators)
    .set({
      fspToken: encryptedToken,
      fspTokenExpiresAt: expiresAt ?? null,
      updatedAt: new Date(),
    })
    .where(eq(operators.id, operatorId));
}

/**
 * Retrieve and decrypt the FSP token for an operator.
 * Returns null if no token is stored or if it has expired.
 */
export async function getOperatorToken(operatorId: number): Promise<string | null> {
  const [op] = await db
    .select({ fspToken: operators.fspToken, fspTokenExpiresAt: operators.fspTokenExpiresAt })
    .from(operators)
    .where(eq(operators.id, operatorId))
    .limit(1);

  if (!op?.fspToken) return null;

  // Check expiry
  if (op.fspTokenExpiresAt && op.fspTokenExpiresAt < new Date()) {
    return null;
  }

  return decrypt(op.fspToken);
}

/**
 * Clear the stored FSP token for an operator.
 */
export async function clearOperatorToken(operatorId: number): Promise<void> {
  await db
    .update(operators)
    .set({
      fspToken: null,
      fspTokenExpiresAt: null,
      updatedAt: new Date(),
    })
    .where(eq(operators.id, operatorId));
}
