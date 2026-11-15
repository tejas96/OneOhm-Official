import {
  customers,
  type DatabaseExecutor,
  leads,
  projects,
  quotations,
  waConversations,
} from '@oneohm/database';
import { type MessageSegment, QUOTED_WAIT_DAYS } from '@oneohm/domain';
import { and, eq, inArray, isNotNull, isNull, lte, or, sql } from 'drizzle-orm';
import type { SegmentPerson } from './run-types';

const DAY_MS = 24 * 3600 * 1000;
const CHUNK = 1000;

/**
 * A quotation counts as unanswered once it was sent on or before `QUOTED_WAIT_DAYS` days ago:
 * its sent time is before the start (India time) of the day after that.
 */
export function quotedCutoff(today: string): Date {
  const startOfToday = new Date(`${today}T00:00:00+05:30`).getTime();
  return new Date(startOfToday - (QUOTED_WAIT_DAYS - 1) * DAY_MS);
}

/** One row per phone number: the first one seen keeps the place. */
export function onePerPhone(people: readonly SegmentPerson[]): SegmentPerson[] {
  const seen = new Set<string>();
  return people.filter((person) => {
    if (seen.has(person.phoneE164)) return false;
    seen.add(person.phoneE164);
    return true;
  });
}

const chunks = <T>(items: readonly T[]): T[][] => {
  const out: T[][] = [];
  for (let at = 0; at < items.length; at += CHUNK) out.push(items.slice(at, at + CHUNK));
  return out;
};

/** Numbers that must not get a marketing message: said STOP, opted out, or not on WhatsApp. */
async function blockedPhones(
  db: DatabaseExecutor,
  phones: readonly string[],
): Promise<Set<string>> {
  const blocked = new Set<string>();
  for (const part of chunks(phones)) {
    const customerRows = await db
      .select({ phone: customers.phoneE164 })
      .from(customers)
      .where(
        and(
          inArray(customers.phoneE164, part),
          or(eq(customers.whatsappOptIn, false), isNotNull(customers.whatsappUnreachableAt)),
        ),
      );
    const chatRows = await db
      .select({ phone: waConversations.phone })
      .from(waConversations)
      .where(and(inArray(waConversations.phone, part), isNotNull(waConversations.optedOutAt)));
    for (const row of [...customerRows, ...chatRows]) blocked.add(row.phone);
  }
  return blocked;
}

async function candidates(
  db: DatabaseExecutor,
  segment: MessageSegment,
  today: string,
): Promise<SegmentPerson[]> {
  if (segment === 'past_customers') {
    const rows = await db
      .select({ id: customers.id, name: customers.name, phone: customers.phoneE164 })
      .from(customers)
      .where(
        and(
          inArray(
            customers.id,
            db
              .select({ id: projects.customerId })
              .from(projects)
              .where(inArray(projects.status, ['operational', 'completed'])),
          ),
          eq(customers.whatsappOptIn, true),
          isNull(customers.whatsappUnreachableAt),
        ),
      );
    return rows.map((row) => ({
      phoneE164: row.phone,
      name: row.name,
      leadId: null,
      customerId: row.id,
    }));
  }
  const base = db
    .select({
      id: leads.id,
      name: leads.name,
      phone: leads.phoneE164,
      customerId: leads.customerId,
    })
    .from(leads);
  const rows =
    segment === 'lost_revisit'
      ? await base.where(
          and(eq(leads.stage, 'lost'), isNotNull(leads.revisitOn), lte(leads.revisitOn, today)),
        )
      : await base
          .innerJoin(quotations, eq(quotations.leadId, leads.id))
          .where(and(eq(leads.stage, 'quoted'), isNotNull(quotations.sentAt)))
          .groupBy(leads.id)
          .having(
            sql`max(${quotations.sentAt}) < ${quotedCutoff(today).toISOString()}::timestamptz`,
          );
  return rows.map((row) => ({
    phoneE164: row.phone,
    name: row.name,
    leadId: row.id,
    customerId: row.customerId,
  }));
}

/**
 * Who is in a segment now: quoted but not won (the latest quotation unanswered for a week),
 * lost leads due a revisit, or customers whose system is running. People who sent STOP, said no
 * to WhatsApp or cannot be reached on it are left out; each number appears once.
 */
export async function segmentPeople(
  db: DatabaseExecutor,
  segment: MessageSegment,
  today: string,
): Promise<SegmentPerson[]> {
  const people = onePerPhone(await candidates(db, segment, today));
  if (people.length === 0) return [];
  const blocked = await blockedPhones(
    db,
    people.map((person) => person.phoneE164),
  );
  return people.filter((person) => !blocked.has(person.phoneE164));
}
