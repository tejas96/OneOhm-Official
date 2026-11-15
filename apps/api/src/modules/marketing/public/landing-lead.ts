import { phoneSchema } from '@oneohm/api-contracts';
import { type DatabaseExecutor, marketingClicks, websiteEnquiries } from '@oneohm/database';
import type { LeadSource } from '@oneohm/domain';
import { and, eq, gt, sql } from 'drizzle-orm';
import { tooMany } from '../../../common/http/errors';
import type { LeadIntakeService } from '../../crm/lead-intake.service';
import { WEBSITE_LIMITS } from '../../crm/website-leads';
import type { LandingCampaign } from './landing-data';
import { landingPath } from './landing-page';

export interface LandingForm {
  readonly name: string;
  readonly phone: string;
  readonly city: string;
  readonly ref: string;
  /** The hidden field: a person never fills it, a bot does. */
  readonly website: string;
}

const text = (value: unknown, max: number) =>
  typeof value === 'string' ? value.trim().slice(0, max) : '';

export function readForm(body: unknown): LandingForm {
  const source = (body ?? {}) as Record<string, unknown>;
  return {
    name: text(source.name, 80),
    phone: text(source.phone, 20),
    city: text(source.city, 80),
    ref: text(source.ref, 12).toLowerCase(),
    website: text(source.website, 200),
  };
}

/** The first thing wrong with the form in plain words, or the checked values. */
export function checkForm(
  form: LandingForm,
):
  | { readonly error: string }
  | { readonly name: string; readonly phone: string; readonly city: string } {
  if (form.name.length < 2) return { error: 'Please enter your name.' };
  const phone = phoneSchema.safeParse(form.phone);
  if (!phone.success) return { error: 'Enter a 10-digit Indian mobile number.' };
  if (form.city.length < 2) return { error: 'Please enter your city.' };
  return { name: form.name, phone: phone.data, city: form.city };
}

/** What the click says about the ad: Google, Instagram or Facebook; anything else is the website. */
export function leadSourceOf(click: {
  readonly gclid: string | null;
  readonly fbclid: string | null;
  readonly utmSource: string | null;
}): LeadSource {
  if (click.gclid) return 'google';
  if (!click.fbclid) return 'website';
  const utm = click.utmSource?.toLowerCase() ?? '';
  return utm.includes('insta') || utm === 'ig' ? 'instagram' : 'facebook';
}

const since = (minutes: number) => new Date(Date.now() - minutes * 60_000);

async function sent(db: DatabaseExecutor, where: ReturnType<typeof eq>, minutes: number) {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(websiteEnquiries)
    .where(and(where, gt(websiteEnquiries.createdAt, since(minutes))));
  return row?.count ?? 0;
}

/** Same limits as the website form (they share its table): a flood from one address or number. */
async function assertBudget(
  db: DatabaseExecutor,
  ip: string | null,
  phone: string,
  perAddress: number,
) {
  const message = 'Thank you, we have your details. Please wait a little before sending again.';
  const { perAddress: address, perPhone } = WEBSITE_LIMITS;
  if (ip && (await sent(db, eq(websiteEnquiries.ip, ip), address.minutes)) >= perAddress) {
    throw tooMany(message);
  }
  if ((await sent(db, eq(websiteEnquiries.phoneE164, phone), perPhone.minutes)) >= perPhone.count) {
    throw tooMany(message);
  }
}

/** A call-back request from a campaign's landing page becomes a lead with its click ids. */
export async function receiveLandingLead(
  db: DatabaseExecutor,
  intake: LeadIntakeService,
  campaign: LandingCampaign,
  form: {
    readonly name: string;
    readonly phone: string;
    readonly city: string;
    readonly ref: string;
  },
  ip: string | null,
  perAddress: number,
): Promise<void> {
  await assertBudget(db, ip, form.phone, perAddress);
  const [click] = form.ref
    ? await db
        .select()
        .from(marketingClicks)
        .where(and(eq(marketingClicks.ref, form.ref), eq(marketingClicks.campaignId, campaign.id)))
    : [];
  const page = landingPath(campaign.code);
  const result = await intake.receive({
    name: form.name,
    phone: form.phone,
    city: form.city,
    source: click ? leadSourceOf(click) : 'website',
    nextActionNote: 'Call back: ad enquiry',
    firstNote: `Call-back form on the ${campaign.name} landing page.`,
    attribution: {
      campaignCode: campaign.code,
      gclid: click?.gclid ?? null,
      fbclid: click?.fbclid ?? null,
      utmSource: click?.utmSource ?? null,
      utmMedium: click?.utmMedium ?? null,
      utmCampaign: click?.utmCampaign ?? null,
      landingPage: page,
    },
  });
  if (click && !click.leadId) {
    await db
      .update(marketingClicks)
      .set({ leadId: result.leadId })
      .where(eq(marketingClicks.id, click.id));
  }
  await db.insert(websiteEnquiries).values({
    name: form.name,
    phoneE164: form.phone,
    city: form.city,
    sourcePage: page,
    ip,
    outcome: result.created ? 'created' : 'existing',
    leadId: result.leadId,
  });
}
