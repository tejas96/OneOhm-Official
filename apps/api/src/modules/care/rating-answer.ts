import {
  customerActions,
  customers,
  type Database,
  notify,
  notifyHolders,
  projects,
  serviceRatings,
  serviceRequests,
  stageRatings,
} from '@oneohm/database';
import { LOW_RATING } from '@oneohm/domain';
import { and, eq } from 'drizzle-orm';
import { recordAudit } from '../../common/audit';
import { logAction } from '../documents/customer-action-log';
import { lowRatingFollowUp } from './low-rating';
import { RATING_WORDS } from './rating-words';

export type RatingResult =
  | { readonly kind: 'old' }
  | { readonly kind: 'thanks' }
  | { readonly kind: 'low'; readonly name: string | null; readonly when: string };

/**
 * The customer's rating from the 5 taps (redesign §13): saved in the one store of its kind (stage
 * ratings, problem ratings), the ask closed. One or two stars: the person who looks after them is told
 * and a call task is made with a promised time; the reply says who calls and when. Tapping twice, or an
 * old list, changes nothing (the ask is closed once).
 */
export function answerRating(
  db: Database,
  customerId: string,
  actionId: string,
  stars: number,
  timeZone: string,
): Promise<RatingResult> {
  return db.transaction(async (tx): Promise<RatingResult> => {
    const [ask] = await tx
      .select()
      .from(customerActions)
      .where(
        and(
          eq(customerActions.id, actionId),
          eq(customerActions.customerId, customerId),
          eq(customerActions.type, 'rating'),
          eq(customerActions.status, 'open'),
        ),
      )
      .for('update');
    if (!ask) return { kind: 'old' };
    const [customer] = await tx
      .select({ name: customers.name, phone: customers.phoneE164 })
      .from(customers)
      .where(eq(customers.id, customerId));
    const low = stars <= LOW_RATING;
    const what = await save(tx, ask.payload, customerId, stars);
    if (!what) return { kind: 'old' };
    const now = new Date();
    await tx
      .update(customerActions)
      .set({
        status: 'closed',
        doneAt: now,
        closedAt: now,
        updatedAt: now,
        payload: { ...ask.payload, stars },
      })
      .where(eq(customerActions.id, ask.id));
    await logAction(tx, ask, {
      kind: 'customer_action',
      message: `${customer?.name ?? 'The customer'} rated ${what.label} ${stars}/5 (WhatsApp)`,
      userId: null,
      data: { customerActionId: ask.id, stars },
    });
    await recordAudit(tx, null, 'customer_action.answered', 'customer_action', ask.id, { stars });
    if (!low) return { kind: 'thanks' };
    const call = await lowRatingFollowUp(tx, {
      customerId,
      customerName: customer?.name ?? 'The customer',
      phone: customer?.phone ?? '',
      projectId: ask.projectId,
      assignee: what.assignee,
      label: what.label,
      stars,
      key: `rating_low:${ask.id}`,
      timeZone,
    });
    return { kind: 'low', name: call.name, when: call.when };
  });
}

type Tx = Parameters<Parameters<Database['transaction']>[0]>[0];

/** Writes the rating in its own store; null when it was there already. */
async function save(
  tx: Tx,
  payload: Record<string, unknown>,
  customerId: string,
  rating: number,
): Promise<{ label: string; assignee: string | null } | null> {
  if (payload.kind === 'stage') {
    const projectId = String(payload.projectId);
    const stage = String(payload.stage);
    const [row] = await tx
      .insert(stageRatings)
      .values({ projectId, customerId, stage, rating })
      .onConflictDoNothing()
      .returning({ id: stageRatings.id });
    if (!row) return null;
    const [project] = await tx
      .select({ manager: projects.managerUserId, code: projects.code })
      .from(projects)
      .where(eq(projects.id, projectId));
    const label = RATING_WORDS.stage[stage] ?? stage;
    const lowStars = rating <= LOW_RATING;
    if (project?.manager)
      await notify(
        tx,
        { userId: project.manager },
        {
          kind: lowStars ? 'stage_rating_low' : 'stage_rated',
          title: `${lowStars ? 'Low rating: ' : ''}${label} rated ${rating}/5`,
          body: `${project.code}: rated on WhatsApp, no comment.`,
          subject: { type: 'project', id: projectId, projectId },
          dedupeKey: `stage_rated:${row.id}`,
        },
      );
    return { label: `the ${label}`, assignee: project?.manager ?? null };
  }
  const requestId = String(payload.requestId);
  const [request] = await tx
    .select({
      category: serviceRequests.category,
      assignee: serviceRequests.assigneeUserId,
      projectId: serviceRequests.projectId,
    })
    .from(serviceRequests)
    .where(and(eq(serviceRequests.id, requestId), eq(serviceRequests.customerId, customerId)));
  if (!request) return null;
  const [row] = await tx
    .insert(serviceRatings)
    .values({ serviceRequestId: requestId, customerId, rating })
    .onConflictDoNothing()
    .returning({ id: serviceRatings.id });
  if (!row) return null;
  if (rating <= LOW_RATING)
    await notifyHolders(tx, 'service.manage', {
      kind: 'service_low_rating',
      title: `A customer rated a service request ${rating} of 5`,
      body: 'Rated on WhatsApp, no comment. Call them to find out what went wrong.',
      subject: { type: 'service_request', id: requestId, projectId: request.projectId },
      dedupeKey: `service_rating:${requestId}:${rating}`,
    });
  return { label: 'the service request', assignee: request.assignee };
}
