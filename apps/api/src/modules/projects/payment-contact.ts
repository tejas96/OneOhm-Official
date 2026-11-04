import {
  companyProfile,
  customers,
  type DatabaseExecutor,
  holdersOf,
  leads,
  projects,
  quotations,
  users,
} from '@oneohm/database';
import { and, eq, inArray } from 'drizzle-orm';
import { assistantLanguage } from '../whatsapp/assistant/language';

export interface Contact {
  readonly name: string | null;
  readonly phone: string | null;
}

/**
 * Who the customer can call (live review C6): the first of the project's people (its
 * manager, then the lead owner) who has a phone, else a business owner or admin who has
 * one. With no phone anywhere, the first of the project's people by name and the
 * business phone, when there is one.
 */
export function pickContact(
  project: readonly Contact[],
  fallback: readonly Contact[],
  businessPhone: string | null,
): Contact {
  const reachable = [...project, ...fallback].find((person) => person.phone);
  if (reachable) return reachable;
  return { name: project[0]?.name ?? null, phone: businessPhone };
}

/** Current members among `ids`: a past member is never the number a customer is given. */
export const currentMembers = (ids: readonly string[]) =>
  and(inArray(users.id, [...ids]), eq(users.status, 'active'));

/** The customer's language and their contact for this project. */
export async function contactFor(tx: DatabaseExecutor, projectId: string) {
  const [row] = await tx
    .select({
      language: customers.preferredLanguage,
      manager: projects.managerUserId,
      leadOwner: leads.ownerUserId,
    })
    .from(projects)
    .innerJoin(customers, eq(customers.id, projects.customerId))
    .innerJoin(quotations, eq(quotations.id, projects.quotationId))
    .leftJoin(leads, eq(leads.id, quotations.leadId))
    .where(eq(projects.id, projectId))
    .limit(1);
  const own = [row?.manager, row?.leadOwner].filter((id): id is string => Boolean(id));
  const admins = await holdersOf(tx, 'settings.manage');
  const ids = [...new Set([...own, ...admins])];
  const people = ids.length
    ? await tx
        .select({ id: users.id, name: users.fullName, phone: users.phoneE164 })
        .from(users)
        .where(currentMembers(ids))
    : [];
  const as = (id: string): Contact[] =>
    people.filter((person) => person.id === id).map(({ name, phone }) => ({ name, phone }));
  const [company] = await tx
    .select({ phones: companyProfile.phones })
    .from(companyProfile)
    .limit(1);
  const contact = pickContact(own.flatMap(as), admins.flatMap(as), company?.phones[0] ?? null);
  return { language: assistantLanguage(row?.language), contact };
}
