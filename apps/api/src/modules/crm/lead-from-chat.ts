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
  const set = {
    ...(change.name !== undefined ? { name: change.name } : {}),
    ...(change.city !== undefined ? { city: change.city } : {}),
    ...(change.subsidyCategory !== undefined ? { subsidyCategory: change.subsidyCategory } : {}),
    ...(change.estimatedWp !== undefined ? { estimatedWp: change.estimatedWp } : {}),
  };
  if (Object.keys(set).length > 0) {
    await tx
      .update(leads)
      .set({ ...set, updatedAt: new Date() })
      .where(eq(leads.id, leadId));
  }
  await logLead(tx, leadId, null, 'whatsapp', note);
}
