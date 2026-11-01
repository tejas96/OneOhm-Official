import { Inject, Injectable } from '@nestjs/common';
import type { TravelClaim, TravelDay } from '@oneohm/api-contracts';
import {
  type Notice,
  notify,
  notifyHolders,
  payables,
  postPayableApproved,
  type Transaction,
  travelClaims,
  users,
} from '@oneohm/database';
import { formatInr, todayIn } from '@oneohm/shared';
import { and, eq, gte, inArray, lte, type SQL } from 'drizzle-orm';
import { recordAudit } from '../../common/audit';
import type { Actor } from '../../common/auth/actor';
import { conflict, forbidden, invalid, notFound } from '../../common/http/errors';
import { daySpan } from '../../common/notices';
import { DATABASE, type Database } from '../../config/core.module';
import { loadPolicy } from '../workforce/policy';
import { readClaims, travelDay } from './travel-read';

export interface ClaimFilter {
  readonly status?: TravelClaim['status'] | undefined;
  readonly userId?: string | undefined;
  readonly from?: string | undefined;
  readonly to?: string | undefined;
}

const km = (metres: number) => `${(metres / 1000).toFixed(1)} km`;

const NOTICES = {
  made: (id: string, name: string, date: string, amount: number): Notice => ({
    kind: 'travel_claim',
    title: 'Travel claim',
    body: `${name}: ${daySpan(date, date)}, ${formatInr(amount)}.`,
    subject: { type: 'travel_claim', id },
    dedupeKey: `travel_claim:${id}`,
  }),
  decided: (id: string, approved: boolean, date: string, amount: number): Notice => ({
    kind: 'travel_claim_decided',
    title: approved ? 'Travel claim approved' : 'Travel claim not approved',
    body: `${daySpan(date, date)}, ${formatInr(amount)}${approved ? '. Finance pays it next.' : '.'}`,
    subject: { type: 'travel_claim', id },
    dedupeKey: `travel_claim_decided:${id}`,
  }),
};

/**
 * Travel between sites, claimed per day at the rate in Settings (PRD 4.3). A manager or
 * HR decides it like leave; an approved claim becomes a payable to the employee, with
 * the travel cost and what is owed posted to the ledger, and finance pays it.
 */
@Injectable()
export class TravelClaimsService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async day(userId: string, date: string = todayIn()): Promise<TravelDay> {
    return travelDay(this.db, userId, date, await loadPolicy(this.db));
  }

  async dayOfClaim(id: string): Promise<TravelDay> {
    const claim = await this.one(id);
    return this.day(claim.user.id, claim.workDate);
  }

  async mine(actor: Actor): Promise<TravelClaim[]> {
    return readClaims(this.db, eq(travelClaims.userId, actor.userId));
  }

  async list(filter: ClaimFilter): Promise<TravelClaim[]> {
    const conditions: SQL[] = [];
    if (filter.status) conditions.push(eq(travelClaims.status, filter.status));
    if (filter.userId) conditions.push(eq(travelClaims.userId, filter.userId));
    if (filter.from) conditions.push(gte(travelClaims.workDate, filter.from));
    if (filter.to) conditions.push(lte(travelClaims.workDate, filter.to));
    return readClaims(this.db, conditions.length ? and(...conditions) : undefined);
  }

  async claim(
    actor: Actor,
    workDate: string,
    note?: string | null,
    projectId?: string | null,
  ): Promise<TravelClaim> {
    if (actor.kind !== 'staff') throw forbidden('Travel claims are for employees.');
    if (workDate > todayIn())
      throw invalid('Claim a day that has started.', { workDate: 'Later.' });
    const day = await this.day(actor.userId, workDate);
    if (day.claim && (day.claim.status === 'pending' || day.claim.status === 'approved'))
      throw conflict('You have already claimed this day.', 'claimed');
    if (!day.claimable)
      throw invalid('There is no travel to claim on this day.', { workDate: 'No distance.' });
    if (projectId && !day.visits.some((visit) => visit.projectId === projectId))
      throw invalid('Pick a project you visited that day.', { projectId: 'Not visited.' });
    const [row] = await this.db
      .insert(travelClaims)
      .values({
        userId: actor.userId,
        workDate,
        distanceM: day.distanceM,
        ratePaisePerKm: day.ratePaisePerKm,
        amountPaise: day.amountPaise,
        legs: day.legs,
        visits: day.visits.length,
        projectId: projectId ?? null,
        note: note?.trim() || null,
      })
      .onConflictDoNothing()
      .returning({ id: travelClaims.id });
    if (!row) throw conflict('You have already claimed this day.', 'claimed');
    await recordAudit(this.db, actor.userId, 'travel_claim.made', 'travel_claim', row.id, {
      workDate,
      amountPaise: day.amountPaise,
      distanceM: day.distanceM,
      projectId: projectId ?? null,
    });
    await notifyHolders(
      this.db,
      'leave.approve',
      NOTICES.made(row.id, actor.fullName, workDate, day.amountPaise),
      actor.userId,
    );
    return this.one(row.id);
  }

  async cancel(actor: Actor, id: string): Promise<TravelClaim> {
    const [row] = await this.db
      .update(travelClaims)
      .set({ status: 'cancelled', updatedAt: new Date() })
      .where(
        and(
          eq(travelClaims.id, id),
          eq(travelClaims.userId, actor.userId),
          inArray(travelClaims.status, ['pending']),
        ),
      )
      .returning({ id: travelClaims.id });
    if (!row) throw conflict('Only a claim waiting for approval can be cancelled.', 'closed');
    return this.one(id);
  }

  async decide(
    actor: Actor,
    id: string,
    approve: boolean,
    note?: string | null,
  ): Promise<TravelClaim> {
    await this.db.transaction(async (tx) => {
      const [row] = await tx
        .select()
        .from(travelClaims)
        .where(eq(travelClaims.id, id))
        .for('update')
        .limit(1);
      if (!row) throw notFound('That travel claim');
      if (row.status !== 'pending') throw conflict('This claim has already been decided.');
      if (row.userId === actor.userId)
        throw conflict('Someone else approves your own claim.', 'own');
      const payableId = approve ? await this.payableFor(tx, actor, row) : null;
      await tx
        .update(travelClaims)
        .set({
          status: approve ? 'approved' : 'rejected',
          decidedByUserId: actor.userId,
          decidedAt: new Date(),
          decisionNote: note?.trim() || null,
          payableId,
          updatedAt: new Date(),
        })
        .where(eq(travelClaims.id, id));
      await notify(
        tx,
        { userId: row.userId },
        NOTICES.decided(id, approve, row.workDate, row.amountPaise),
      );
      await recordAudit(
        tx,
        actor.userId,
        `travel_claim.${approve ? 'approved' : 'rejected'}`,
        'travel_claim',
        id,
        { amountPaise: row.amountPaise, payableId },
      );
    });
    return this.one(id);
  }

  /** The approved claim as money owed to the employee, booked in the ledger at once. */
  private async payableFor(
    tx: Transaction,
    actor: Actor,
    row: typeof travelClaims.$inferSelect,
  ): Promise<string> {
    const [person] = await tx
      .select({ fullName: users.fullName })
      .from(users)
      .where(eq(users.id, row.userId))
      .limit(1);
    const rate = formatInr(row.ratePaisePerKm);
    const now = new Date();
    const [payable] = await tx
      .insert(payables)
      .values({
        party: 'employee',
        partyName: person?.fullName ?? 'Employee',
        partyUserId: row.userId,
        description: `Travel ${daySpan(row.workDate, row.workDate)} · ${km(row.distanceM)} at ${rate}/km`,
        amountPaise: row.amountPaise,
        dueOn: todayIn(),
        status: 'approved',
        approvedByUserId: actor.userId,
        approvedAt: now,
      })
      .returning({ id: payables.id });
    if (!payable) throw new Error('Payable insert returned nothing.');
    await postPayableApproved(tx, payable.id, actor.userId);
    return payable.id;
  }

  private async one(id: string): Promise<TravelClaim> {
    const [claim] = await readClaims(this.db, eq(travelClaims.id, id));
    if (!claim) throw notFound('That travel claim');
    return claim;
  }
}
