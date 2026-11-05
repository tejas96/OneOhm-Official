import type { QuotationDetail } from '@oneohm/api-contracts';
import {
  customers,
  type DatabaseExecutor,
  leads,
  type Notice,
  notifyCover,
  notifyHolders,
  quotations,
  type Transaction,
} from '@oneohm/database';
import { formatInr, todayIn } from '@oneohm/shared';
import { and, eq, gt, inArray, ne } from 'drizzle-orm';
import { recordAudit } from '../../common/audit';
import { environmentOnce } from '../../config/environment-once';
import { autoMoveLead, setLeadNextAction } from '../crm/lead-history';
import { applyAcceptedChange } from '../project-changes/change-accept';
import { changeAwaiting, closeStaleChanges } from '../project-changes/change-close';
import { projectAwaiting } from './project-revision';
import { quoteHasProject, startProjectNote } from './quotation-project';
import { freezeQuotedTerms } from './quoted-terms';
import { applyAcceptedRevision } from './revision-accept';

/** Past its last day, or its discount still waits for approval. */
const lapsed = (quotation: QuotationDetail) =>
  quotation.validUntil < todayIn() || quotation.discountPendingApproval;

async function hasNewerRevision(
  db: DatabaseExecutor,
  row: { readonly number: string; readonly revision: number },
): Promise<boolean> {
  const [newer] = await db
    .select({ id: quotations.id })
    .from(quotations)
    .where(and(eq(quotations.number, row.number), gt(quotations.revision, row.revision)))
    .limit(1);
  return Boolean(newer);
}

/**
 * Whether the customer may still act on this quote: sent, not past its last day, no
 * discount waiting for approval, no newer revision. The accept path and [See quotation]
 * read it the same way.
 */
export async function quoteIsOpen(db: DatabaseExecutor, quotation: QuotationDetail) {
  if (quotation.status !== 'sent' || lapsed(quotation)) return false;
  return !(await hasNewerRevision(db, quotation));
}

/** What the customer's own "Yes, accept" came to. */
export type CustomerAcceptance = 'accepted' | 'already' | 'not_open' | 'not_owner';

/**
 * Marks the quotation accepted in the caller's transaction: other revisions of its number
 * are replaced, the lead moves to won with "Start project" as its next action today, and
 * the audit row says who and how. `actorUserId` is null when the customer accepted it
 * themselves. False, with nothing changed, when the quotation was no longer open: someone
 * else accepted (or closed) it a moment before.
 */
export async function acceptInTx(
  tx: Transaction,
  quotation: QuotationDetail,
  actorUserId: string | null,
  auditData: Record<string, unknown>,
): Promise<boolean> {
  const id = quotation.id;
  // Only an open quotation moves; a staff Accept racing the customer's "yes" waits here.
  const [accepted] = await tx
    .update(quotations)
    .set({ status: 'accepted', acceptedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(quotations.id, id), inArray(quotations.status, ['draft', 'sent'])))
    .returning({ id: quotations.id });
  if (!accepted) return false;
  // Accepted without being sent: the terms agreed are today's.
  await freezeQuotedTerms(tx, id);
  await tx
    .update(quotations)
    .set({ status: 'superseded', updatedAt: new Date() })
    .where(
      and(
        eq(quotations.number, quotation.number),
        ne(quotations.id, id),
        inArray(quotations.status, ['draft', 'sent', 'accepted']),
      ),
    );
  if (quotation.input.leadId) {
    const note = `Quotation ${quotation.number} accepted${actorUserId ? '' : ' by the customer on WhatsApp'}.`;
    await autoMoveLead(tx, quotation.input.leadId, actorUserId, 'won', note);
  }
  // Only staff accept a revision tied to a project (a customer's tap on one goes to a
  // person, see `customerVerdict`), so only a staff acceptance moves the project.
  if (actorUserId) {
    await applyAcceptedRevision(tx, id, quotation.totalPaise, actorUserId);
    // A revision carrying a project change applies it (PRD 3.15); other open changes lapse.
    await applyAcceptedChange(tx, id, actorUserId);
    await closeStaleChanges(tx, id, quotation.number, actorUserId);
  }
  // A new sale: starting its project is the lead owner's job today (a revision has one).
  if (quotation.input.leadId && !(await quoteHasProject(tx, id))) {
    const on = todayIn(environmentOnce().BUSINESS_TIMEZONE);
    const note = startProjectNote(quotation.number);
    await setLeadNextAction(tx, quotation.input.leadId, actorUserId, { on, note });
  }
  await recordAudit(tx, actorUserId, 'quotation.accepted', 'quotation', id, auditData);
  return true;
}

/**
 * Whether the customer may accept this quotation from this phone. Locks the quotation
 * row first, so two "yes" taps handled at once accept it once: the second sees `already`.
 * Only the customer's own number accepts, and only the newest open revision, still valid,
 * with any discount approved. A survey or change revision needs a project manager.
 */
export async function customerVerdict(
  tx: Transaction,
  quotation: QuotationDetail,
  phoneE164: string,
): Promise<CustomerAcceptance | 'open'> {
  const [customer] = await tx
    .select({ phone: customers.phoneE164 })
    .from(customers)
    .where(eq(customers.id, quotation.customer.id));
  if (customer?.phone !== phoneE164) return 'not_owner';
  const [row] = await tx
    .select({ status: quotations.status, number: quotations.number, revision: quotations.revision })
    .from(quotations)
    .where(eq(quotations.id, quotation.id))
    .for('update');
  if (row?.status === 'accepted') return 'already';
  if (row?.status !== 'sent') return 'not_open';
  if (lapsed(quotation) || (await hasNewerRevision(tx, row))) return 'not_open';
  if ((await projectAwaiting(tx, quotation.id)) || (await changeAwaiting(tx, quotation.id)))
    return 'not_open';
  return 'open';
}

/** The lead owner and the people who set up projects hear that the customer said yes. */
export async function tellStartProject(tx: Transaction, quotation: QuotationDetail) {
  const notice: Notice = {
    kind: 'quotation_accepted',
    title: `${quotation.customer.name} accepted ${quotation.number} on WhatsApp — start the project`,
    body: `${formatInr(quotation.totalPaise)} · ${quotation.propertyLabel}`,
    subject: { type: 'quotation', id: quotation.id },
    dedupeKey: `quote_accepted:${quotation.id}`,
  };
  const [lead] = quotation.input.leadId
    ? await tx
        .select({ owner: leads.ownerUserId })
        .from(leads)
        .where(eq(leads.id, quotation.input.leadId))
    : [];
  // The same per-person key as notifyHolders, so an owner who also sets up projects hears
  // once; an owner on leave today is covered by their backup, or else by the project setters.
  if (lead?.owner) await notifyCover(tx, lead.owner, 'projects.create', notice);
  await notifyHolders(tx, 'projects.create', notice);
}
