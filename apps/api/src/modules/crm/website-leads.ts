import type { WebsiteLeadInput } from '@oneohm/api-contracts';
import { type DatabaseExecutor, websiteEnquiries } from '@oneohm/database';
import { and, eq, gt, sql } from 'drizzle-orm';
import { tooMany } from '../../common/http/errors';
import type { LeadIntakeService } from './lead-intake.service';

/** How often the public form may be sent: per address, and per phone number. */
export const WEBSITE_LIMITS = {
  perAddress: { count: 5, minutes: 10 },
  perPhone: { count: 3, minutes: 24 * 60 },
} as const;

const since = (minutes: number) => new Date(Date.now() - minutes * 60_000);

async function sent(db: DatabaseExecutor, where: ReturnType<typeof eq>, minutes: number) {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(websiteEnquiries)
    .where(and(where, gt(websiteEnquiries.createdAt, since(minutes))));
  return row?.count ?? 0;
}

/** Refuses a flood from one address or onto one number (HTTP 429). */
async function assertBudget(db: DatabaseExecutor, ip: string | null, phone: string) {
  const { perAddress, perPhone } = WEBSITE_LIMITS;
  const message = 'Thank you, we have your details. Please wait a little before sending again.';
  if (ip && (await sent(db, eq(websiteEnquiries.ip, ip), perAddress.minutes)) >= perAddress.count)
    throw tooMany(message);
  if ((await sent(db, eq(websiteEnquiries.phoneE164, phone), perPhone.minutes)) >= perPhone.count)
    throw tooMany(message);
}

/**
 * The website enquiry form (PRD 3.3): a new lead with an owner by rule, or a nudge on
 * the open lead with this number. Kept as it arrived. A filled hidden field is a bot.
 */
export async function receiveWebsiteLead(
  db: DatabaseExecutor,
  intake: LeadIntakeService,
  input: WebsiteLeadInput,
  ip: string | null,
): Promise<void> {
  if (input.website?.trim()) return;
  await assertBudget(db, ip, input.phone);
  const message = input.message?.trim() || null;
  const page = input.sourcePage?.trim() || null;
  const result = await intake.receive({
    name: input.name,
    phone: input.phone,
    city: input.city,
    source: 'website',
    nextActionNote: 'Call back: website enquiry',
    notes: message,
    firstNote: `Website form${page ? ` on ${page}` : ''}${message ? `: ${message}` : '.'}`,
  });
  await db.insert(websiteEnquiries).values({
    name: input.name,
    phoneE164: input.phone,
    city: input.city,
    message,
    sourcePage: page,
    ip,
    outcome: result.created ? 'created' : 'existing',
    leadId: result.leadId,
  });
}
