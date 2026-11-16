import { Inject, Injectable } from '@nestjs/common';
import type { TravelClaim, TravelDay } from '@oneohm/api-contracts';
import {
  approveTravelClaim,
  ensureTravelSnapshot,
  notify,
  reviewDayClaim,
  tellClaimDeciders,
  travelClaims,
} from '@oneohm/database';
import { todayIn } from '@oneohm/shared';
import { and, eq, gte, inArray, isNull, lte, type SQL } from 'drizzle-orm';
import { recordAudit } from '../../common/audit';
import type { Actor } from '../../common/auth/actor';
import { currentCalendar } from '../../common/calendar';
import { conflict, forbidden, invalid, notFound } from '../../common/http/errors';
import { DATABASE, type Database } from '../../config/core.module';
import { loadPolicy } from '../workforce/policy';
import { insertClaimLocked } from './travel-claim-insert';
import { TRAVEL_NOTICES } from './travel-claim-notices';
import { assertMayDecideClaim } from './travel-claim-people';
import { voidClaim } from './travel-claim-void';
import { readClaims, travelDay } from './travel-read';

export interface ClaimFilter {
  readonly status?: TravelClaim['status'] | undefined;
  readonly userId?: string | undefined;
  readonly from?: string | undefined;
  readonly to?: string | undefined;
}

/**
 * Travel between sites, claimed per day at the rate in Settings (PRD 4.3). The person's
 * manager, HR or finance decide it (not any leave approver); an approved claim becomes a payable to the employee, with
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
    // Claims taken back when the person reopened the day are not theirs to see any more.
    return readClaims(
      this.db,
      and(eq(travelClaims.userId, actor.userId), isNull(travelClaims.withdrawnByResumeAt)),
    );
  }

  async list(actor: Actor, filter: ClaimFilter): Promise<TravelClaim[]> {
    const conditions: SQL[] = [];
    if (filter.status) conditions.push(eq(travelClaims.status, filter.status));
    if (filter.userId) conditions.push(eq(travelClaims.userId, filter.userId));
    if (filter.from) conditions.push(gte(travelClaims.workDate, filter.from));
    if (filter.to) conditions.push(lte(travelClaims.workDate, filter.to));
    return readClaims(this.db, conditions.length ? and(...conditions) : undefined, actor);
  }

  async claim(
    actor: Actor,
    workDate: string,
    note?: string | null,
    projectId?: string | null,
  ): Promise<TravelClaim> {
    if (actor.kind !== 'staff') throw forbidden('Travel claims are for employees.');
    if (workDate > todayIn(currentCalendar().timeZone))
      throw invalid('Claim a day that has started.', { workDate: 'Later.' });
    // A claim is for a closed day: a clear 409 while the day is running (live review S5).
    // A day closed before saved travel existed is saved now, before anything clears it.
    const snapshot = await ensureTravelSnapshot(this.db, actor.userId, workDate);
    const policy = await loadPolicy(this.db);
    const day = await travelDay(this.db, actor.userId, workDate, policy);
    if (day.claim && (day.claim.status === 'pending' || day.claim.status === 'approved'))
      throw conflict('You have already claimed this day.', 'claimed');
    if (!day.closed) throw conflict('End your day to claim.', 'day_open');
    if (!day.claimable)
      throw invalid('There is no travel to claim on this day.', { workDate: 'No distance.' });
    if (projectId && !day.visits.some((visit) => visit.projectId === projectId))
      throw invalid('Pick a project you visited that day.', { projectId: 'Not visited.' });
    // The approver reads why a day deserves a look on this claim too, made by hand or not.
    const reasons = snapshot
      ? (await reviewDayClaim(this.db, snapshot, policy, true)).review.reasons
      : [];
    const row = await insertClaimLocked(this.db, {
      userId: actor.userId,
      workDate,
      distanceM: day.distanceM,
      ratePaisePerKm: day.ratePaisePerKm,
      amountPaise: day.amountPaise,
      legs: day.legs,
      visits: day.visits.length,
      projectId: projectId ?? null,
      note: note?.trim() || null,
      reviewReasons: reasons.length > 0 ? [...reasons] : null,
    });
    if (!row) throw conflict('You have already claimed this day.', 'claimed');
    await recordAudit(this.db, actor.userId, 'travel_claim.made', 'travel_claim', row.id, {
      workDate,
      amountPaise: day.amountPaise,
      distanceM: day.distanceM,
      projectId: projectId ?? null,
    });
    // The person's manager (or cover) hears first; HR, then finance, when there is none.
    await tellClaimDeciders(
      this.db,
      actor.userId,
      TRAVEL_NOTICES.made(row.id, actor.fullName, workDate, day.amountPaise),
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
    expectedAmountPaise?: number,
  ): Promise<TravelClaim> {
    await this.db.transaction(async (tx) => {
      const [row] = await tx
        .select()
        .from(travelClaims)
        .where(eq(travelClaims.id, id))
        .for('update')
        .limit(1);
      if (!row) throw notFound('That travel claim');
      // Only the person's manager, HR or finance, and never the person (S10).
      await assertMayDecideClaim(tx, actor, row.userId);
      if (row.status !== 'pending') throw conflict('This claim has already been decided.');
      // New route points can change the amount after the approver opened it: decide on what they saw.
      if (expectedAmountPaise !== undefined && expectedAmountPaise !== row.amountPaise)
        throw conflict(
          'The amount of this claim changed. Check it and decide again.',
          'amount_changed',
          {
            amountPaise: row.amountPaise,
          },
        );
      if (approve) {
        // The same path the system takes on a clean day: payable, ledger, finance and worker told.
        await approveTravelClaim(tx, row, { userId: actor.userId, note });
        return;
      }
      await tx
        .update(travelClaims)
        .set({
          status: 'rejected',
          decidedByUserId: actor.userId,
          decidedAt: new Date(),
          decisionNote: note?.trim() || null,
          updatedAt: new Date(),
        })
        .where(eq(travelClaims.id, id));
      await notify(
        tx,
        { userId: row.userId },
        TRAVEL_NOTICES.decided(id, false, row.workDate, row.amountPaise),
      );
      await recordAudit(tx, actor.userId, 'travel_claim.rejected', 'travel_claim', id, {
        amountPaise: row.amountPaise,
        payableId: null,
      });
    });
    return this.one(id, actor);
  }

  /** Voids an approved claim nobody has paid; see `voidClaim`. */
  async void(actor: Actor, id: string, reason: string): Promise<TravelClaim> {
    await this.db.transaction((tx) => voidClaim(tx, actor, id, reason));
    return this.one(id, actor);
  }

  private async one(id: string, viewer?: Actor): Promise<TravelClaim> {
    const [claim] = await readClaims(this.db, eq(travelClaims.id, id), viewer);
    if (!claim) throw notFound('That travel claim');
    return claim;
  }
}
