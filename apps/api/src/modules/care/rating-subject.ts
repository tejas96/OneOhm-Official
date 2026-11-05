import {
  customers,
  type DatabaseExecutor,
  projects,
  serviceRatings,
  serviceRequests,
  stageRatings,
} from '@oneohm/database';
import { and, eq } from 'drizzle-orm';
import type { RatingTarget } from './rating-ask';

/** Who is asked and what about: the customer, the home and whether the rating is given already. */
export interface Subject {
  readonly customerId: string;
  readonly phone: string;
  readonly name: string;
  readonly language: string;
  readonly projectId: string | null;
  readonly projectCode: string;
  /** "site survey" / the problem's topic: what the question is about. */
  readonly about: string;
  readonly once: string;
  readonly rated: boolean;
}

export async function subjectOf(
  db: DatabaseExecutor,
  target: RatingTarget,
): Promise<Subject | null> {
  if (target.kind === 'stage') {
    const [row] = await db
      .select({
        customerId: customers.id,
        phone: customers.phoneE164,
        name: customers.name,
        language: customers.preferredLanguage,
        code: projects.code,
      })
      .from(projects)
      .innerJoin(customers, eq(customers.id, projects.customerId))
      .where(eq(projects.id, target.projectId));
    if (!row) return null;
    const [done] = await db
      .select({ id: stageRatings.id })
      .from(stageRatings)
      .where(
        and(eq(stageRatings.projectId, target.projectId), eq(stageRatings.stage, target.stage)),
      );
    return {
      customerId: row.customerId,
      phone: row.phone,
      name: row.name,
      language: row.language,
      projectId: target.projectId,
      projectCode: row.code,
      about: target.stage,
      once: `rating:stage:${target.projectId}:${target.stage}`,
      rated: Boolean(done),
    };
  }
  const [row] = await db
    .select({
      customerId: customers.id,
      phone: customers.phoneE164,
      name: customers.name,
      language: customers.preferredLanguage,
      projectId: serviceRequests.projectId,
      category: serviceRequests.category,
    })
    .from(serviceRequests)
    .innerJoin(customers, eq(customers.id, serviceRequests.customerId))
    .where(eq(serviceRequests.id, target.requestId));
  if (!row) return null;
  const [done] = await db
    .select({ id: serviceRatings.id })
    .from(serviceRatings)
    .where(eq(serviceRatings.serviceRequestId, target.requestId));
  const code = row.projectId
    ? ((
        await db
          .select({ code: projects.code })
          .from(projects)
          .where(eq(projects.id, row.projectId))
      )[0]?.code ?? '')
    : '';
  return {
    customerId: row.customerId,
    phone: row.phone,
    name: row.name,
    language: row.language,
    projectId: row.projectId,
    projectCode: code,
    about: row.category,
    once: `rating:problem:${target.requestId}`,
    rated: Boolean(done),
  };
}
