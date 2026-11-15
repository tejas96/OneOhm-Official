import { Inject, Injectable } from '@nestjs/common';
import type { PhoneMatch } from '@oneohm/api-contracts';
import {
  customers,
  type DatabaseExecutor,
  type LeadAttribution,
  leadActivities,
  leadCampaigns,
  leads,
  marketingClicks,
  notify,
} from '@oneohm/database';
import { campaignLabel, type LeadSource } from '@oneohm/domain';
import { todayIn } from '@oneohm/shared';
import { and, eq, isNull, notInArray, sql } from 'drizzle-orm';
import { type Actor, can } from '../../common/auth/actor';
import { AppError } from '../../common/http/errors';
import { DATABASE, type Database } from '../../config/core.module';
import { adLeadAlert, arrivalKey, cameFromAd } from './lead-ad-alert';
import { SOURCE_LABEL } from './lead-labels';
import { alertNobodyFree, ownerByRule } from './lead-owner';

/** Nobody holds the leads permission, so a new lead has no one to take it. Waiting will not fix it. */
export class NoLeadTaker extends AppError {
  constructor() {
    super(
      409,
      'Nobody can take new leads yet. Give a staff role the leads permission.',
      'conflict',
    );
  }
}

/** Where a lead came from, plus the landing-page visit (a Marketing click) it should claim. */
export type IntakeAttribution = LeadAttribution & { readonly clickId?: string };

export interface IntakeInput {
  readonly name: string;
  readonly phone: string;
  readonly city: string;
  readonly source: LeadSource;
  readonly referredByCustomerId?: string | null;
  readonly nextActionNote: string;
  readonly notes?: string | null;
  /** The first line on the lead's timeline, e.g. "Sent the website form from /solar". */
  readonly firstNote: string;
  /** Where the lead came from; written only when a lead is made (first touch wins). */
  readonly attribution?: IntakeAttribution | undefined;
}

/** The campaign in words (its listed name, else code, ad or UTM), or null. */
async function campaignOf(
  db: DatabaseExecutor,
  attribution: LeadAttribution | undefined,
): Promise<string | null> {
  if (!attribution) return null;
  const [listed] = attribution.campaignCode
    ? await db
        .select({ name: leadCampaigns.name })
        .from(leadCampaigns)
        .where(eq(leadCampaigns.code, attribution.campaignCode))
        .limit(1)
    : [];
  return campaignLabel({
    campaignCode: attribution.campaignCode ?? null,
    campaignName: listed?.name ?? null,
    adId: attribution.adId ?? null,
    adHeadline: attribution.adHeadline ?? null,
    utmCampaign: attribution.utmCampaign ?? null,
  });
}

export interface IntakeResult {
  readonly leadId: string;
  readonly name: string;
  readonly createdAt: Date;
  /** False when an open lead already had this number and got a nudge instead. */
  readonly created: boolean;
}

/**
 * Leads that arrive without a person picking an owner: the website form, a WhatsApp
 * call-back, a customer's referral (PRD 3.3). Each gets an owner by rule, a follow-up
 * today, and an alert to that owner. The open lead on the same number is never doubled.
 */
@Injectable()
export class LeadIntakeService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async openLeadByPhone(db: DatabaseExecutor, phone: string) {
    const [open] = await db
      .select({
        id: leads.id,
        name: leads.name,
        ownerUserId: leads.ownerUserId,
        createdAt: leads.createdAt,
      })
      .from(leads)
      .where(and(eq(leads.phoneE164, phone), notInArray(leads.stage, ['won', 'lost'])))
      .limit(1);
    return open ?? null;
  }

  /**
   * A new lead, or a nudge (note, follow-up today, alert) on the open lead with this number.
   * Pass a transaction to make it part of the caller's work (it runs as a savepoint).
   */
  receive(input: IntakeInput, db: DatabaseExecutor = this.db): Promise<IntakeResult> {
    return db.transaction(async (tx) => {
      // Two webhooks for one number at once take turns: the second sees the first's lead.
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${input.phone}))`);
      const open = await this.openLeadByPhone(tx, input.phone);
      if (!open) return this.insert(tx, input);
      const today = todayIn();
      await tx
        .update(leads)
        .set({
          nextActionOn: today,
          nextActionTime: null,
          nextActionNote: input.nextActionNote,
          updatedAt: new Date(),
        })
        .where(eq(leads.id, open.id));
      await tx
        .insert(leadActivities)
        .values({ leadId: open.id, kind: 'note', note: input.firstNote });
      if (open.ownerUserId) await this.tellOwner(tx, open.ownerUserId, open, input, true);
      return { leadId: open.id, name: open.name, createdAt: open.createdAt, created: false };
    });
  }

  /** A new lead with an owner by rule; the caller has already ruled out an open duplicate. */
  create(input: IntakeInput): Promise<IntakeResult> {
    return this.db.transaction((tx) => this.insert(tx, input));
  }

  /** Who already has this number, before the office adds a lead for it. */
  async match(actor: Actor, phone: string): Promise<PhoneMatch> {
    const open = await this.openLeadByPhone(this.db, phone);
    const [customer] = can(actor, 'customers.view')
      ? await this.db
          .select({ id: customers.id, name: customers.name })
          .from(customers)
          .where(eq(customers.phoneE164, phone))
          .limit(1)
      : [];
    return {
      openLead: open ? { id: open.id, name: open.name } : null,
      customer: customer ?? null,
    };
  }

  private async insert(tx: DatabaseExecutor, input: IntakeInput): Promise<IntakeResult> {
    const ruled = await ownerByRule(tx, { city: input.city });
    if (!ruled) throw new NoLeadTaker();
    const owner = ruled.userId;
    const today = todayIn();
    const { clickId, ...columns } = input.attribution ?? {};
    const [lead] = await tx
      .insert(leads)
      .values({
        name: input.name,
        phoneE164: input.phone,
        city: input.city,
        source: input.source,
        referredByCustomerId: input.referredByCustomerId ?? null,
        ownerUserId: owner,
        nextActionOn: today,
        nextActionNote: input.nextActionNote,
        notes: input.notes ?? null,
        ...columns,
      })
      .returning({ id: leads.id, name: leads.name, createdAt: leads.createdAt });
    if (!lead) throw new Error('Lead insert returned nothing.');
    await tx
      .insert(leadActivities)
      .values({ leadId: lead.id, kind: 'note', note: input.firstNote });
    if (clickId)
      await tx
        .update(marketingClicks)
        .set({ leadId: lead.id })
        .where(and(eq(marketingClicks.id, clickId), isNull(marketingClicks.leadId)));
    await this.tellOwner(tx, owner, lead, input, false);
    if (ruled.fallback) await alertNobodyFree(tx, lead);
    return { leadId: lead.id, name: lead.name, createdAt: lead.createdAt, created: true };
  }

  /**
   * "New lead · <source>" (an ad lead: "New ad lead · call now"; a person already on file who
   * wrote again from an ad: "<name> came back from an ad · call now"). The campaign is the one
   * this arrival came from. The dedupe key is per arrival, not per day.
   */
  private async tellOwner(
    tx: DatabaseExecutor,
    ownerUserId: string,
    lead: { readonly id: string; readonly name: string },
    input: IntakeInput,
    cameBack: boolean,
  ) {
    const campaign = await campaignOf(tx, input.attribution);
    const fromAd = await cameFromAd(tx, input.source, input.attribution);
    const from = campaign ? ` Campaign: ${campaign}.` : '';
    const words = fromAd
      ? adLeadAlert({
          name: lead.name,
          city: input.city,
          from: campaign ?? SOURCE_LABEL[input.source],
          cameBack,
        })
      : {
          title: `New lead · ${SOURCE_LABEL[input.source]}`,
          body: `${lead.name}, ${input.city}.${from} ${input.nextActionNote}.`,
        };
    return notify(
      tx,
      { userId: ownerUserId },
      {
        kind: 'lead_assigned',
        ...words,
        subject: { type: 'lead', id: lead.id },
        dedupeKey: `lead_intake:${lead.id}:${ownerUserId}:${arrivalKey(input)}`,
      },
    );
  }
}
