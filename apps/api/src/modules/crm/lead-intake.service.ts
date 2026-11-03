import { Inject, Injectable } from '@nestjs/common';
import type { PhoneMatch } from '@oneohm/api-contracts';
import {
  customers,
  type DatabaseExecutor,
  type LeadAttribution,
  leadActivities,
  leads,
  notify,
} from '@oneohm/database';
import type { LeadSource } from '@oneohm/domain';
import { todayIn } from '@oneohm/shared';
import { and, eq, notInArray } from 'drizzle-orm';
import { type Actor, can } from '../../common/auth/actor';
import { conflict } from '../../common/http/errors';
import { DATABASE, type Database } from '../../config/core.module';
import { SOURCE_LABEL } from './lead-labels';
import { alertNobodyFree, ownerByRule } from './lead-owner';

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
  readonly attribution?: LeadAttribution | undefined;
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

  /** A new lead, or a nudge (note, follow-up today, alert) on the open lead with this number. */
  receive(input: IntakeInput): Promise<IntakeResult> {
    return this.db.transaction(async (tx) => {
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
      if (open.ownerUserId) await this.tellOwner(tx, open.ownerUserId, open, input, today);
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
    if (!ruled) {
      throw conflict('Nobody can take new leads yet. Give a staff role the leads permission.');
    }
    const owner = ruled.userId;
    const today = todayIn();
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
        ...input.attribution,
      })
      .returning({ id: leads.id, name: leads.name, createdAt: leads.createdAt });
    if (!lead) throw new Error('Lead insert returned nothing.');
    await tx
      .insert(leadActivities)
      .values({ leadId: lead.id, kind: 'note', note: input.firstNote });
    await this.tellOwner(tx, owner, lead, input, today);
    if (ruled.fallback) await alertNobodyFree(tx, lead);
    return { leadId: lead.id, name: lead.name, createdAt: lead.createdAt, created: true };
  }

  private tellOwner(
    tx: DatabaseExecutor,
    ownerUserId: string,
    lead: { readonly id: string; readonly name: string },
    input: IntakeInput,
    today: string,
  ) {
    return notify(
      tx,
      { userId: ownerUserId },
      {
        kind: 'lead_assigned',
        title: `New lead · ${SOURCE_LABEL[input.source]}`,
        body: `${lead.name}, ${input.city}. ${input.nextActionNote}.`,
        subject: { type: 'lead', id: lead.id },
        dedupeKey: `lead_intake:${lead.id}:${ownerUserId}:${today}`,
      },
    );
  }
}
