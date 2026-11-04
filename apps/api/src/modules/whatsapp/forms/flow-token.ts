import { randomBytes } from 'node:crypto';
import { type DatabaseExecutor, waFlowTokens } from '@oneohm/database';
import { and, eq, gt, isNull } from 'drizzle-orm';
import type { FormKey } from './form-registry';

/** A form stays usable this long after we sent it; the daily clean-up then removes the token. */
export const FORM_TOKEN_DAYS = 7;

/** What a "Send a paper" form is for: the paper request it answers. */
export type SendPaperPayload =
  | { readonly actionId: string }
  | { readonly key: string; readonly propertyId: string | null };

export interface FlowToken<P = Record<string, unknown>> {
  readonly token: string;
  readonly formKey: FormKey;
  readonly customerId: string;
  readonly payload: P;
}

/** Makes the token a form is sent with, saved with what it is for and when it stops working. */
export async function issueFlowToken(
  db: DatabaseExecutor,
  about: {
    formKey: FormKey;
    conversationId: string;
    customerId: string;
    payload: Record<string, unknown>;
  },
  now = new Date(),
): Promise<string> {
  const token = randomBytes(18).toString('base64url');
  await db.insert(waFlowTokens).values({
    token,
    formKey: about.formKey,
    conversationId: about.conversationId,
    customerId: about.customerId,
    payload: about.payload,
    expiresAt: new Date(now.getTime() + FORM_TOKEN_DAYS * 86_400_000),
  });
  return token;
}

/**
 * Takes a token for its one reply: it must be ours, for this chat and form, not used and not
 * expired; taking marks it used, so a second reply (or a retry that raced) gets null.
 */
export async function takeFlowToken(
  db: DatabaseExecutor,
  token: string | null,
  conversationId: string,
  now = new Date(),
): Promise<FlowToken | null> {
  if (!token) return null;
  const [row] = await db
    .update(waFlowTokens)
    .set({ usedAt: now })
    .where(
      and(
        eq(waFlowTokens.token, token),
        eq(waFlowTokens.conversationId, conversationId),
        isNull(waFlowTokens.usedAt),
        gt(waFlowTokens.expiresAt, now),
      ),
    )
    .returning();
  if (!row) return null;
  return {
    token: row.token,
    formKey: row.formKey as FormKey,
    customerId: row.customerId,
    payload: row.payload as Record<string, unknown>,
  };
}

/** Gives a token back when its reply could not be handled at all, so the customer can retry it. */
export async function releaseFlowToken(db: DatabaseExecutor, token: string): Promise<void> {
  await db.update(waFlowTokens).set({ usedAt: null }).where(eq(waFlowTokens.token, token));
}
