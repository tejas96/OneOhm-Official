import {
  customers,
  type DatabaseExecutor,
  leads,
  projects,
  waConversations,
} from '@oneohm/database';
import { and, eq, exists, gte, isNotNull, ne, or, sql } from 'drizzle-orm';

const DAY_MS = 86_400_000;

/**
 * Numbers that sent STOP or said no to WhatsApp messages. They are left out of every list
 * (the same people the message runs leave out in `runs/segments.ts`, without the unreachable ones:
 * a number that is off WhatsApp can still see ads).
 */
export async function optedOutPhones(db: DatabaseExecutor): Promise<Set<string>> {
  const people = await db
    .select({ phone: customers.phoneE164 })
    .from(customers)
    .where(eq(customers.whatsappOptIn, false));
  const chats = await db
    .select({ phone: waConversations.phone })
    .from(waConversations)
    .where(isNotNull(waConversations.optedOutAt));
  return new Set([...people, ...chats].map((row) => row.phone));
}

/** Phones of people still worth reaching: open leads from the last 180 days, and quoted ones. */
export async function interestedPhones(db: DatabaseExecutor, now: Date): Promise<string[]> {
  const rows = await db
    .selectDistinct({ phone: leads.phoneE164 })
    .from(leads)
    .where(
      and(
        ne(leads.stage, 'won'),
        // Lost for good (no day set to try again) is left out.
        or(ne(leads.stage, 'lost'), isNotNull(leads.revisitOn)),
        or(gte(leads.createdAt, new Date(now.getTime() - 180 * DAY_MS)), eq(leads.stage, 'quoted')),
      ),
    );
  const out = await optedOutPhones(db);
  return rows.map((row) => row.phone).filter((phone) => !out.has(phone));
}

/** Phones of customers who bought: a won lead or a project. */
export async function customerPhones(db: DatabaseExecutor): Promise<string[]> {
  const rows = await db
    .selectDistinct({ phone: customers.phoneE164 })
    .from(customers)
    .where(
      or(
        exists(
          db
            .select({ one: sql`1` })
            .from(leads)
            .where(and(eq(leads.customerId, customers.id), eq(leads.stage, 'won'))),
        ),
        exists(
          db.select({ one: sql`1` }).from(projects).where(eq(projects.customerId, customers.id)),
        ),
      ),
    );
  const out = await optedOutPhones(db);
  return rows.map((row) => row.phone).filter((phone) => !out.has(phone));
}
