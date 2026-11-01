import { Inject, Injectable } from '@nestjs/common';
import type { Lead, LeadDetail } from '@oneohm/api-contracts';
import { leadActivities, leads, users } from '@oneohm/database';
import type { LeadSource, LeadStage, SubsidyCategory } from '@oneohm/domain';
import { todayIn } from '@oneohm/shared';
import { and, asc, desc, eq, ilike, inArray, notInArray, or, type SQL } from 'drizzle-orm';
import { type Actor, can } from '../../common/auth/actor';
import { conflict, forbidden, invalid, notFound } from '../../common/http/errors';
import { definedOnly, type Patch } from '../../common/patch';
import { DATABASE, type Database } from '../../config/core.module';
import { STAGE_LABEL } from './lead-labels';

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
  nextActionNote?: string | null | undefined;
  notes?: string | null | undefined;
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
    },
  ): Promise<Lead[]> {
    const conditions: SQL[] = [this.visibility(actor)];
    if (filter.stage) conditions.push(eq(leads.stage, filter.stage));
    if (filter.open) conditions.push(notInArray(leads.stage, CLOSED));
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
      .orderBy(asc(leads.nextActionOn), desc(leads.createdAt));
    return this.present(rows);
  }

  async get(actor: Actor, id: string): Promise<LeadDetail> {
    const [row] = await this.db
      .select()
      .from(leads)
      .where(and(eq(leads.id, id), this.visibility(actor)))
      .limit(1);
    if (!row) throw notFound('That lead');
    const [lead] = await this.present([row]);
    const activityRows = await this.db
      .select({ activity: leadActivities, userName: users.fullName })
      .from(leadActivities)
      .leftJoin(users, eq(users.id, leadActivities.userId))
      .where(eq(leadActivities.leadId, id))
      .orderBy(desc(leadActivities.createdAt));
    if (!lead) throw notFound('That lead');
    return {
      ...lead,
      activities: activityRows.map(({ activity, userName }) => ({
        id: activity.id,
        kind: activity.kind,
        note: activity.note,
        user: activity.userId && userName ? { id: activity.userId, fullName: userName } : null,
        createdAt: activity.createdAt.toISOString(),
      })),
    };
  }

  async create(actor: Actor, input: NewLead): Promise<Lead> {
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
    const [created] = await this.db
      .insert(leads)
      .values({
        name: input.name,
        phoneE164: input.phone,
        email: input.email ?? null,
        city: input.city,
        source: reseller ? 'reseller' : input.source,
        subsidyCategory: input.subsidyCategory,
        estimatedWp: input.estimatedWp ?? null,
        ownerUserId: reseller ? null : (input.ownerUserId ?? actor.userId),
        resellerUserId: reseller ? actor.userId : null,
        nextActionOn: input.nextActionOn,
        nextActionNote: input.nextActionNote ?? null,
        notes: input.notes ?? null,
      })
      .returning();
    if (!created) throw new Error('Lead insert returned nothing.');
    await this.log(created.id, actor.userId, 'note', 'Lead created.');
    const [lead] = await this.present([created]);
    if (!lead) throw notFound('That lead');
    return lead;
  }

  async update(
    actor: Actor,
    id: string,
    patch: Patch<{
      stage: LeadStage;
      ownerUserId: string | null;
      nextActionOn: string | null;
      nextActionNote: string | null;
      lostReason: string | null;
      estimatedWp: number | null;
    }>,
  ): Promise<LeadDetail> {
    const current = await this.get(actor, id);
    const stage = patch.stage ?? current.stage;
    const nextActionOn =
      patch.nextActionOn === undefined ? current.nextActionOn : patch.nextActionOn;
    if (!CLOSED.includes(stage) && !nextActionOn) {
      throw invalid('An open lead needs a next action date.', {
        nextActionOn: 'Choose when to follow up.',
      });
    }
    if (stage === 'lost' && !(patch.lostReason ?? current.lostReason)) {
      throw invalid('Say why the lead was lost.', { lostReason: 'Required when a lead is lost.' });
    }
    await this.db
      .update(leads)
      .set({
        ...definedOnly(patch),
        ...(stage === 'won' && current.stage !== 'won' ? { wonAt: new Date() } : {}),
        updatedAt: new Date(),
      })
      .where(eq(leads.id, id));
    if (patch.stage && patch.stage !== current.stage)
      await this.log(
        id,
        actor.userId,
        'stage_change',
        `Moved from ${STAGE_LABEL[current.stage]} to ${STAGE_LABEL[patch.stage]}.`,
      );
    if (patch.nextActionOn && patch.nextActionOn !== current.nextActionOn) {
      await this.log(
        id,
        actor.userId,
        'follow_up',
        `Next action on ${patch.nextActionOn}${patch.nextActionNote ? `: ${patch.nextActionNote}` : ''}.`,
      );
    }
    return this.get(actor, id);
  }

  async addActivity(
    actor: Actor,
    id: string,
    kind: 'note' | 'call' | 'visit' | 'whatsapp',
    note: string,
  ): Promise<LeadDetail> {
    await this.get(actor, id);
    await this.log(id, actor.userId, kind, note);
    return this.get(actor, id);
  }

  async link(id: string, customerId: string, propertyId: string): Promise<void> {
    await this.db
      .update(leads)
      .set({ customerId, propertyId, updatedAt: new Date() })
      .where(eq(leads.id, id));
  }

  private async log(
    leadId: string,
    userId: string,
    kind: 'note' | 'call' | 'visit' | 'whatsapp' | 'stage_change' | 'follow_up',
    note: string,
  ) {
    await this.db.insert(leadActivities).values({ leadId, userId, kind, note });
  }

  /** Staff with `leads.view_all` see every lead; others see the leads they own or brought. */
  private visibility(actor: Actor): SQL {
    if (can(actor, 'leads.view_all')) return eq(leads.id, leads.id);
    if (!can(actor, 'leads.view_own') && !can(actor, 'leads.manage')) throw forbidden();
    return (
      or(eq(leads.ownerUserId, actor.userId), eq(leads.resellerUserId, actor.userId)) ??
      eq(leads.ownerUserId, actor.userId)
    );
  }

  private async present(rows: Array<typeof leads.$inferSelect>): Promise<Lead[]> {
    const ownerIds = [
      ...new Set(rows.map((row) => row.ownerUserId).filter((id): id is string => id !== null)),
    ];
    const owners = ownerIds.length
      ? await this.db
          .select({ id: users.id, fullName: users.fullName })
          .from(users)
          .where(inArray(users.id, ownerIds))
      : [];
    const today = todayIn();
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      phone: row.phoneE164,
      email: row.email,
      city: row.city,
      source: row.source,
      stage: row.stage,
      subsidyCategory: row.subsidyCategory,
      estimatedWp: row.estimatedWp,
      owner: owners.find((owner) => owner.id === row.ownerUserId) ?? null,
      nextActionOn: row.nextActionOn,
      nextActionNote: row.nextActionNote,
      overdue: !CLOSED.includes(row.stage) && row.nextActionOn !== null && row.nextActionOn < today,
      customerId: row.customerId,
      propertyId: row.propertyId,
      lostReason: row.lostReason,
      notes: row.notes,
      createdAt: row.createdAt.toISOString(),
    }));
  }
}
