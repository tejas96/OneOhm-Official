import { type DatabaseExecutor, leads } from '@oneohm/database';
import { eq } from 'drizzle-orm';
import { logLead } from './lead-history';

/** What the WhatsApp bot may change on a lead as the customer answers. */
export interface LeadChatChange {
  readonly name?: string;
  readonly city?: string;
  readonly subsidyCategory?: 'individual' | 'society' | 'commercial';
  readonly estimatedWp?: number;
}

/**
 * A change the bot makes on a lead with no signed-in person: only the fields given are
 * written, and one timeline line (from WhatsApp, no user) says what happened.
 */
export async function updateLeadFromChat(
  tx: DatabaseExecutor,
  leadId: string,
  change: LeadChatChange,
  note: string,
): Promise<void> {
  const fields = Object.fromEntries(
    Object.entries(change).filter(([, value]) => value !== undefined),
  );
  if (Object.keys(fields).length > 0) {
    await tx
      .update(leads)
      .set({ ...fields, updatedAt: new Date() })
      .where(eq(leads.id, leadId));
  }
  await logLead(tx, leadId, null, 'whatsapp', note);
}
