import {
  brandName,
  customers,
  marketingReviewRequests,
  messageTemplates,
  outbox,
  projects,
  readBusinessSetting,
} from '@oneohm/database';
import { googleReviewLink } from '@oneohm/domain';
import { and, eq, gte, inArray, isNotNull, isNull, sql } from 'drizzle-orm';
import { optOutNote } from '../in-window';
import type { MarketingDeps } from './deps';
import { firstName } from './review-rules';

const FINISHED = ['operational', 'completed'] as const;
const DAY_MS = 86_400_000;

/** Only projects that started running in the last 14 days are asked: old customers never are. */
const RECENT_DAYS = 14;

/** Recently finished projects with no request yet, with their customer. */
const unasked = (deps: MarketingDeps, now: Date) =>
  deps.db
    .select({
      projectId: projects.id,
      customerId: customers.id,
      name: customers.name,
      phone: customers.phoneE164,
      optIn: customers.whatsappOptIn,
      unreachableAt: customers.whatsappUnreachableAt,
      /** The customer was already asked for another project. */
      askedBefore: sql<boolean>`exists (
        select 1 from marketing_review_requests asked
          join projects other on other.id = asked.project_id
         where other.customer_id = ${customers.id} and asked.status = 'asked'
      )`,
    })
    .from(projects)
    .innerJoin(customers, eq(customers.id, projects.customerId))
    .leftJoin(marketingReviewRequests, eq(marketingReviewRequests.projectId, projects.id))
    .where(
      and(
        inArray(projects.status, [...FINISHED]),
        isNotNull(projects.operationalAt),
        gte(projects.operationalAt, new Date(now.getTime() - RECENT_DAYS * DAY_MS)),
        isNull(marketingReviewRequests.projectId),
      ),
    );

/** The review message must be approved and switched on before anyone is asked. */
async function templateActive(deps: MarketingDeps): Promise<boolean> {
  const [saved] = await deps.db
    .select({ active: messageTemplates.active })
    .from(messageTemplates)
    .where(eq(messageTemplates.key, 'review_request'));
  return saved?.active === true;
}

/**
 * Asks each newly operational project's customer for a Google review on WhatsApp, once. Null
 * while the setting is off, no place is set, or the message is not active yet. Only projects that
 * became operational in the last 14 days are asked, so old customers never are.
 */
export async function queueReviewRequests(deps: MarketingDeps, now: Date): Promise<number | null> {
  const { db } = deps;
  const settings = await readBusinessSetting(db, 'marketing');
  const link = googleReviewLink(settings.googlePlaceId);
  if (!settings.askForReviews || !link) return null;
  if (!(await templateActive(deps))) return null;
  const waiting = await unasked(deps, now);
  const company = await brandName(db);
  let asked = 0;
  const askedNow = new Set<string>();
  for (const row of waiting) {
    const skip =
      !row.optIn ||
      row.unreachableAt !== null ||
      row.askedBefore ||
      askedNow.has(row.customerId) ||
      (await optOutNote(db, row.phone));
    if (skip) {
      await db
        .insert(marketingReviewRequests)
        .values({ projectId: row.projectId, status: 'skipped' })
        .onConflictDoNothing();
      continue;
    }
    await db.transaction(async (tx) => {
      const [made] = await tx
        .insert(outbox)
        .values({
          channel: 'whatsapp',
          recipient: row.phone,
          template: 'review_request',
          payload: { customer: firstName(row.name), company, link },
          dedupeKey: `review_request:${row.projectId}`,
        })
        .onConflictDoNothing()
        .returning({ id: outbox.id });
      await tx
        .insert(marketingReviewRequests)
        .values({ projectId: row.projectId, status: 'asked', outboxId: made?.id ?? null })
        .onConflictDoNothing();
    });
    askedNow.add(row.customerId);
    asked += 1;
  }
  return asked;
}
