import { Inject, Injectable } from '@nestjs/common';
import type { Lead, LeadDetail } from '@oneohm/api-contracts';
import { leads } from '@oneohm/database';
import type { LeadSource, LeadStage, SubsidyCategory } from '@oneohm/domain';
import { todayIn } from '@oneohm/shared';
import { and, asc, desc, eq, ilike, notInArray, or, type SQL } from 'drizzle-orm';
import type { Actor } from '../../common/auth/actor';
import { conflict, invalid, notFound } from '../../common/http/errors';
import { definedOnly } from '../../common/patch';
import { DATABASE, type Database } from '../../config/core.module';
import { resolveReferralCode } from '../referrals/referral-codes';
import { cancelAllAsks } from '../send-to-customer/send-cancel-all';
import { followAssignee, lockVisitTarget } from '../visits/follow-assignee';
import { autoMoveLead, logLead, logLeadChanges, tellLeadOwner } from './lead-history';
import { alertNobodyFree, assertCanOwnLeads, ownerByRule } from './lead-owner';
import { presentLeads } from './lead-present';
import { leadVisibility, needsFollowUp, readLeadDetail, unownedLeads } from './lead-read';
import { pickStep, stepColumns } from './lead-steps-read';
import {
  assertFollowUpAhead,
  assertOpenLeadComplete,
  type LeadPatch,
  lostColumns,
} from './lead-update';

const CLOSED: LeadStage[] = ['won', 'lost'];

export interface NewLead {
  name: string;
  phone: string;
  email?: string | null | undefined;
  city: string;
  source: LeadSource;
  subsidyCategory: SubsidyCategory;
  estimatedWp?: number | null | undefined;
  ownerUserId?: string | null | undefined;
  nextActionOn: string;
  nextActionTime?: string | null | undefined;
  nextActionNote?: string | null | undefined;
  notes?: string | null | undefined;
  referralCode?: string | null | undefined;
}

/** Every lead has an owner and a next action; an open lead is never silent (PRD 3.3). */
@Injectable()
export class LeadsService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async list(
    actor: Actor,
    filter: {
      stage?: LeadStage | undefined;
      search?: string | undefined;
      open?: boolean | undefined;
      unowned?: boolean | undefined;
    },
  ): Promise<Lead[]> {
    const conditions: SQL[] = [leadVisibility(actor)];
    if (filter.stage) conditions.push(eq(leads.stage, filter.stage));
    if (filter.open) conditions.push(needsFollowUp(todayIn()));
    if (filter.unowned) conditions.push(unownedLeads(this.db));
    if (filter.search) {
      const term = `%${filter.search}%`;
      const match = or(
        ilike(leads.name, term),
        ilike(leads.phoneE164, term),
        ilike(leads.city, term),
      );
      if (match) conditions.push(match);
    }
    const rows = await this.db
      .select()
      .from(leads)
      .where(and(...conditions))
      .orderBy(asc(leads.nextActionOn), asc(leads.nextActionTime), desc(leads.createdAt));
    return presentLeads(this.db, rows);
  }

  get(actor: Actor, id: string): Promise<LeadDetail> {
    return readLeadDetail(this.db, actor, id);
  }

  async create(actor: Actor, input: NewLead): Promise<Lead> {
    assertFollowUpAhead(input.nextActionOn, todayIn());
    const [duplicate] = await this.db
      .select({ id: leads.id, name: leads.name })
      .from(leads)
      .where(and(eq(leads.phoneE164, input.phone), notInArray(leads.stage, CLOSED)))
      .limit(1);
    if (duplicate) {
      throw conflict(
        `${duplicate.name} already has an open lead with this number.`,
        `duplicate_lead:${duplicate.id}`,
      );
    }
    const reseller = actor.kind === 'reseller';
    const referrer = await this.referrer(input);
    // A reseller's lead gets a OneOhm owner by rule; staff own what they add unless they pick.
    const ruled = reseller ? await ownerByRule(this.db, { city: input.city }) : null;
    const owner = reseller ? ruled?.userId : (input.ownerUserId ?? actor.userId);
    if (!owner) throw conflict('Nobody can take new leads yet. Ask an admin to set up Sales.');
    if (input.ownerUserId) await assertCanOwnLeads(this.db, input.ownerUserId);
    const [created] = await this.db
      .insert(leads)
      .values({
        name: input.name,
        phoneE164: input.phone,
        email: input.email ?? null,
        city: input.city,
        source: leadSource(reseller, referrer !== null, input.source),
        referredByCustomerId: referrer?.customerId ?? null,
        subsidyCategory: input.subsidyCategory,
        estimatedWp: input.estimatedWp ?? null,
        ownerUserId: owner,
        resellerUserId: reseller ? actor.userId : null,
        nextActionOn: input.nextActionOn,
        nextActionTime: input.nextActionTime ?? null,
        nextActionNote: input.nextActionNote ?? null,
        notes: input.notes ?? null,
      })
      .returning();
    if (!created) throw new Error('Lead insert returned nothing.');
    await logLead(this.db, created.id, actor.userId, 'note', createdNote(referrer));
    if (owner !== actor.userId) await tellLeadOwner(this.db, owner, created, actor.fullName);
    if (ruled?.fallback) await alertNobodyFree(this.db, created);
    const [lead] = await presentLeads(this.db, [created]);
    if (!lead) throw notFound('That lead');
    return lead;
  }

  async update(actor: Actor, id: string, patch: LeadPatch): Promise<LeadDetail> {
    const current = await this.get(actor, id);
    const step = patch.stepKey ? await pickStep(this.db, patch.stepKey) : null;
    const stage = step?.stage ?? patch.stage ?? current.stage;
    assertOpenLeadComplete(current, patch, stage);
    if (patch.nextActionOn !== current.nextActionOn)
      assertFollowUpAhead(patch.nextActionOn, todayIn());
    // Won means a customer: convert first, so the site and quotation have a home.
    if (stage === 'won' && current.stage !== 'won' && !current.customerId) {
      throw invalid('Convert this lead to a customer before marking it won.', {
        stage: 'Convert the lead first.',
      });
    }
    if (patch.ownerUserId && patch.ownerUserId !== current.owner?.id) {
      await assertCanOwnLeads(this.db, patch.ownerUserId);
    }
    const lost = lostColumns(current, patch, stage, todayIn());
    // Reopening a lead that never had an owner gives it one by rule.
    const needsOwner = !CLOSED.includes(stage) && !current.owner && patch.ownerUserId === undefined;
    const ruled = needsOwner ? await ownerByRule(this.db, { city: current.city }) : null;
    const owner = needsOwner ? ruled?.userId : patch.ownerUserId;
    if (needsOwner && !owner) throw invalid('Pick who follows this lead up.');
    await this.db.transaction(async (tx) => {
      const handsOver = owner !== undefined && owner !== current.owner?.id;
      // Before the owner changes: booking a survey takes this lock first too.
      if (handsOver) await lockVisitTarget(tx, { leadId: id });
      await tx
        .update(leads)
        .set({
          ...definedOnly({
            ...patch,
            ...lost,
            ...(owner === undefined ? {} : { ownerUserId: owner }),
          }),
          ...timeColumns(current, patch),
          ...stepColumns(step, patch.stage),
          ...(stage === 'won' && current.stage !== 'won' ? { wonAt: new Date() } : {}),
          updatedAt: new Date(),
        })
        .where(eq(leads.id, id));
      await logLeadChanges(tx, actor, current, { patch, step, stage, lost, owner });
      if (owner && handsOver) await followAssignee(tx, { leadId: id }, owner, actor.userId);
      // A lost lead has nothing more to ask of the customer: every open ask and visit is cancelled, once told.
      if (stage === 'lost' && current.stage !== 'lost')
        await cancelAllAsks(tx, { leadId: id }, actor.userId, 'lead lost');
    });
    if (ruled?.fallback) await alertNobodyFree(this.db, current);
    return this.get(actor, id);
  }

  async addActivity(
    actor: Actor,
    id: string,
    kind: 'note' | 'call' | 'visit' | 'whatsapp',
    note: string,
    internal = false,
  ): Promise<LeadDetail> {
    await this.get(actor, id);
    await logLead(this.db, id, actor.userId, kind, note, internal && actor.kind !== 'reseller');
    // OneOhm staff's first call, visit or WhatsApp is the first contact; a reseller's is not.
    if (kind !== 'note' && actor.kind !== 'reseller') {
      await autoMoveLead(this.db, id, actor.userId, 'contacted', `First ${kind} by the team.`);
    }
    return this.get(actor, id);
  }

  async link(id: string, customerId: string, propertyId: string): Promise<void> {
    await this.db
      .update(leads)
      .set({ customerId, propertyId, updatedAt: new Date() })
      .where(eq(leads.id, id));
  }

  /** The customer whose referral code came with the lead; a code that fits no one is an error. */
  private async referrer(input: NewLead) {
    if (!input.referralCode?.trim()) return null;
    const owner = await resolveReferralCode(this.db, input.referralCode);
    if (!owner) {
      throw invalid('No customer has this referral code.', {
        referralCode: 'Check the code with the customer who referred them.',
      });
    }
    if (owner.phone === input.phone) {
      throw invalid('A customer cannot refer themselves.', {
        referralCode: 'This code belongs to the same phone number.',
      });
    }
    return owner;
  }
}

/** A new follow-up day without a time drops the old day's time. */
function timeColumns(current: LeadDetail, patch: LeadPatch) {
  const newDay = patch.nextActionOn !== undefined && patch.nextActionOn !== current.nextActionOn;
  if (patch.nextActionTime !== undefined || !newDay) return {};
  return { nextActionTime: null };
}

/** A reseller's lead is theirs; a referral code makes it a referral; else what staff picked. */
function leadSource(reseller: boolean, referred: boolean, picked: LeadSource): LeadSource {
  if (reseller) return 'reseller';
  return referred ? 'referral' : picked;
}

/** The first timeline line, naming who referred the lead when someone did. */
function createdNote(referrer: { readonly name: string; readonly code: string } | null): string {
  return referrer
    ? `Lead created, referred by ${referrer.name} (${referrer.code}).`
    : 'Lead created.';
}
