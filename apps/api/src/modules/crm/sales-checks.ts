import {
  customers,
  type Database,
  leads,
  notifications,
  notify,
  notifyHolders,
  quotations,
} from '@oneohm/database';
import { lastWorkEnd } from '@oneohm/domain';
import { addDays, todayIn } from '@oneohm/shared';
import { and, eq, gte, isNotNull, like, lte, notInArray, type SQL, sql } from 'drizzle-orm';
import { acceptedWithoutProject } from '../quotations/quotation-project';
import { PROMISED_CALL_HISTORY, PROMISED_CALL_NOTE } from './lead-from-chat';

/** The owner hears this many days before a sent quote runs out. */
export const VALIDITY_WARNING_DAYS = 3;
/** Older misses are not raised again (a first run on old data stays quiet). */
const LOOK_BACK_DAYS = 14;

/** No alert with this dedupe key went out yet (the unique index answers it). */
const notAlerted = (key: SQL) =>
  sql`not exists (select 1 from ${notifications} n where n.dedupe_key = ${key})`;

/** The last day whose working hours are over: today after 6:30 pm, else yesterday. */
const lastEndedDay = (now: Date, zone: string) => todayIn(zone, lastWorkEnd(now, zone));

/**
 * A sent quote with 3 days or less left, still not accepted and its lead not lost: one
 * alert to the lead owner (or whoever made it). The customer is not messaged without an
 * approved template.
 */
export async function expiringQuotes(db: Database, now: Date, zone: string): Promise<number> {
  const today = todayIn(zone, now);
  const due = await db
    .select({
      id: quotations.id,
      number: quotations.number,
      validUntil: quotations.validUntil,
      customer: customers.name,
      owner: sql<string | null>`coalesce(${leads.ownerUserId}, ${quotations.createdByUserId})`,
    })
    .from(quotations)
    .innerJoin(customers, eq(customers.id, quotations.customerId))
    .leftJoin(leads, eq(leads.id, quotations.leadId))
    .where(
      and(
        eq(quotations.status, 'sent'),
        sql`${leads.stage} is distinct from 'lost'`,
        gte(quotations.validUntil, today),
        lte(quotations.validUntil, addDays(today, VALIDITY_WARNING_DAYS)),
        notAlerted(sql`'quote_validity:' || ${quotations.id}`),
      ),
    );
  let told = 0;
  for (const quote of due) {
    if (!quote.owner) continue;
    await notify(
      db,
      { userId: quote.owner },
      {
        kind: 'quotation_expiring',
        title: `${quote.number} for ${quote.customer} runs out on ${quote.validUntil}`,
        body: 'Not accepted yet. Call the customer before the quote runs out.',
        subject: { type: 'quotation', id: quote.id },
        dedupeKey: `quote_validity:${quote.id}`,
      },
    );
    told += 1;
  }
  return told;
}

/**
 * The bot promised a call ("today" or "tomorrow morning"); once that day's working hours
 * are over with no call logged on the lead since, the owner gets one alert.
 */
export async function missedPromisedCalls(db: Database, now: Date, zone: string): Promise<number> {
  const ended = lastEndedDay(now, zone);
  const promisedAt = sql`(select max(p.created_at) from lead_activities p
    where p.lead_id = ${leads.id} and p.note like ${`${PROMISED_CALL_HISTORY}%`})`;
  const due = await db
    .select({ id: leads.id, name: leads.name, owner: leads.ownerUserId, on: leads.nextActionOn })
    .from(leads)
    .where(
      and(
        eq(leads.nextActionNote, PROMISED_CALL_NOTE),
        isNotNull(leads.ownerUserId),
        notInArray(leads.stage, ['won', 'lost']),
        lte(leads.nextActionOn, ended),
        gte(leads.nextActionOn, addDays(ended, -LOOK_BACK_DAYS)),
        sql`not exists (select 1 from lead_activities c where c.lead_id = ${leads.id}
          and c.kind = 'call' and c.created_at >= coalesce(${promisedAt}, '-infinity'))`,
        notAlerted(sql`'call_promised:' || ${leads.id} || ':' || ${leads.nextActionOn}::text`),
      ),
    );
  let told = 0;
  for (const lead of due) {
    if (!lead.owner) continue;
    await notify(
      db,
      { userId: lead.owner },
      {
        kind: 'call_not_logged',
        title: `Promised call to ${lead.name}: no call logged`,
        body: `WhatsApp told them we would call on ${lead.on}. Call, then log the call on the lead.`,
        subject: { type: 'lead', id: lead.id },
        dedupeKey: `call_promised:${lead.id}:${lead.on}`,
      },
    );
    told += 1;
  }
  return told;
}

/**
 * A quote accepted and still without a project once the next working day is over: one
 * alert to the people who set up projects, so the advance link is not left waiting.
 */
export async function acceptedNoProject(db: Database, now: Date, zone: string): Promise<number> {
  const ended = lastEndedDay(now, zone);
  const since = new Date(now.getTime() - LOOK_BACK_DAYS * 86_400_000);
  let told = 0;
  for (const quote of await acceptedWithoutProject(db, since)) {
    if (!quote.acceptedAt || addDays(todayIn(zone, quote.acceptedAt), 1) > ended) continue;
    const key = `quote_no_project:${quote.id}`;
    const [sent] = await db
      .select({ id: notifications.id })
      .from(notifications)
      .where(like(notifications.dedupeKey, `${key}:%`))
      .limit(1);
    if (sent) continue;
    await notifyHolders(db, 'projects.create', {
      kind: 'quotation_no_project',
      title: `${quote.customer} accepted ${quote.number}: no project yet`,
      body: 'Accepted over a working day ago. Start the project so the advance link goes out.',
      subject: { type: 'quotation', id: quote.id },
      dedupeKey: key,
    });
    told += 1;
  }
  return told;
}
