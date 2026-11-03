import { type DatabaseExecutor, leads } from '@oneohm/database';
import { eq } from 'drizzle-orm';
import { logLead } from './lead-history';

/** What the WhatsApp bot may change on a lead as the customer answers. */
export interface LeadChatChange {
  readonly name?: string;
  readonly city?: string;
  readonly subsidyCategory?: 'individual' | 'society' | 'commercial';
  readonly estimatedWp?: number;
  /** The owner's next step after the estimate: a date (`YYYY-MM-DD`) and what to do. */
  readonly nextAction?: { readonly on: string; readonly note: string };
}

/**
 * A change the bot makes on a lead with no signed-in person: only the fields given are
 * written, and one timeline line (from WhatsApp, no user) says what happened; a null
 * note when another line already says it.
 */
export async function updateLeadFromChat(
  tx: DatabaseExecutor,
  leadId: string,
  change: LeadChatChange,
  note: string | null,
): Promise<void> {
  const set = {
    ...(change.name !== undefined ? { name: change.name } : {}),
    ...(change.city !== undefined ? { city: change.city } : {}),
    ...(change.subsidyCategory !== undefined ? { subsidyCategory: change.subsidyCategory } : {}),
    ...(change.estimatedWp !== undefined ? { estimatedWp: change.estimatedWp } : {}),
    ...(change.nextAction !== undefined
      ? {
          nextActionOn: change.nextAction.on,
          nextActionTime: null,
          nextActionNote: change.nextAction.note,
        }
      : {}),
  };
  if (Object.keys(set).length > 0) {
    await tx
      .update(leads)
      .set({ ...set, updatedAt: new Date() })
      .where(eq(leads.id, leadId));
  }
  if (note !== null) await logLead(tx, leadId, null, 'whatsapp', note);
}
