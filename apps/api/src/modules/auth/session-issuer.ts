import { createHash, randomBytes } from 'node:crypto';
import type { CurrentUser } from '@oneohm/api-contracts';
import { sessions, users } from '@oneohm/database';
import { eq } from 'drizzle-orm';
import { unauthenticated } from '../../common/http/errors';
import type { Database } from '../../config/core.module';
import type { Environment } from '../../config/environment';
import { loadCurrentUser } from './current-user.loader';

const DAY_MS = 86_400_000;

/** One-way fingerprint for tokens and codes: only this is ever stored. */
export const hashSecret = (value: string) => createHash('sha256').update(value).digest('base64url');

export interface IssuedSession {
  readonly token: string;
  readonly expiresAt: Date;
  readonly user: CurrentUser;
}

/** Starts a session for an active person; the token is shown once and only its hash is kept. */
export async function issueSession(
  db: Database,
  env: Environment,
  userId: string,
  client: 'web' | 'mobile',
): Promise<IssuedSession> {
  const user = await loadCurrentUser(db, userId);
  if (!user) throw unauthenticated('This account is not active.');
  const token = randomBytes(32).toString('base64url');
  const days = client === 'web' ? env.SESSION_DAYS_WEB : env.SESSION_DAYS_MOBILE;
  const expiresAt = new Date(Date.now() + days * DAY_MS);
  await db.insert(sessions).values({ userId, tokenHash: hashSecret(token), client, expiresAt });
  await db.update(users).set({ lastActiveAt: new Date() }).where(eq(users.id, userId));
  return { token, expiresAt, user };
}
