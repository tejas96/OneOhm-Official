import type { TravelClaim, TravelDay } from '@oneohm/api-contracts';
import {
  type DatabaseExecutor,
  managerIdsOf,
  payables,
  projects,
  readTravelFacts,
  readTravelSnapshot,
  siteVisits,
  travelClaims,
  travelDays,
  users,
} from '@oneohm/database';
import {
  claimBlocker,
  isHrOrFinance,
  travelAmountPaise,
  travelDeciderProblem,
  type WorkforcePolicy,
} from '@oneohm/domain';
import { todayIn } from '@oneohm/shared';
import { and, desc, eq, type SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { currentCalendar } from '../../common/calendar';
import { visitRecords } from './site-visit-read';
import { kmOf, liveMeasure } from './travel-km-read';

/**
 * One person's travel on a day (PRD 4.3): the office check-in, each site check-in in
 * order, and the office check-out, with straight-line distances between them. A closed
 * day reads from what was saved when it closed (distance, legs and the km rate of that
 * day, live review S3, S4); a running day, or one closed before saving existed, is
 * measured from the live rows at today's rate and can not be claimed until it closes.
 */
export async function travelDay(
  db: DatabaseExecutor,
  userId: string,
  date: string,
  policy: WorkforcePolicy,
): Promise<TravelDay> {
  const where = and(eq(siteVisits.userId, userId), eq(siteVisits.workDate, date)) as SQL;
  const [visits, facts, saved, claims] = await Promise.all([
    visitRecords(db, where),
    readTravelFacts(db, userId, date),
    readTravelSnapshot(db, userId, date),
    readClaims(db, and(eq(travelClaims.userId, userId), eq(travelClaims.workDate, date)) as SQL),
  ]);
  const ordered = [...visits].sort((left, right) => left.checkInAt.localeCompare(right.checkInAt));
  // A closed day reads what was saved; a running one is measured now, route included.
  const kept =
    facts.closed && saved
      ? {
          summary: {
            distanceM: saved.paidM,
            ratePaisePerKm: saved.ratePaisePerKm,
            legs: saved.legs,
          },
          km: kmOf(saved),
        }
      : liveMeasure(facts, policy, ordered.length);
  const amountPaise = travelAmountPaise(kept.summary.distanceM, kept.summary.ratePaisePerKm);
  // A claim taken back when the day was reopened is not the day's claim any more.
  const current = claims.filter((claim) => !claim.withdrawn);
  const live = current.find((claim) => claim.status === 'pending' || claim.status === 'approved');
  const shown = live ?? current[0] ?? null;
  return {
    ...kept.km,
    autoMade: shown?.autoMade ?? false,
    autoApproved: shown?.autoApproved ?? false,
    reviewReasons: shown?.reviewReasons ?? [],
    workDate: date,
    visits: ordered,
    legs: kept.summary.legs.map(({ fromLabel, toLabel, distanceM: metres }) => ({
      fromLabel,
      toLabel,
      distanceM: metres,
    })),
    distanceM: kept.summary.distanceM,
    ratePaisePerKm: kept.summary.ratePaisePerKm,
    amountPaise,
    unlocated: ordered.filter((visit) => visit.locationNote === 'not_shared').length,
    claim: shown,
    closed: facts.closed,
    claimable:
      claimBlocker({
        closed: facts.closed,
        amountPaise,
        live: Boolean(live),
        future: date > todayIn(currentCalendar().timeZone),
      }) === null,
  };
}

const decider = alias(users, 'decider');

/** Finance or HR, and never the claimant's own claim. */
const mayVoid = (viewer: ClaimViewer | undefined, claimantId: string): boolean =>
  Boolean(viewer) &&
  viewer?.userId !== claimantId &&
  isHrOrFinance([...(viewer?.capabilities ?? [])]);

/** The person looking at claims, to say which of them they may decide (S10). */
export interface ClaimViewer {
  readonly userId: string;
  readonly capabilities: ReadonlySet<string>;
}

/** Whether the viewer is the manager (or cover), HR or finance for each claimant, never for themselves. */
async function decidableBy(
  db: DatabaseExecutor,
  viewer: ClaimViewer | undefined,
  claimantIds: readonly string[],
): Promise<Set<string>> {
  if (!viewer || claimantIds.length === 0) return new Set();
  const managers = await managerIdsOf(db, claimantIds);
  return new Set(
    claimantIds.filter(
      (claimantId) =>
        travelDeciderProblem({
          decider: { userId: viewer.userId, capabilities: [...viewer.capabilities] },
          claimantId,
          managerIds: managers.get(claimantId) ?? [],
        }) === null,
    ),
  );
}

/**
 * Claims with who made and decided them, and whether finance has paid them. With a viewer,
 * each says whether that person may decide it (only for claims still open to a decision).
 */
export async function readClaims(
  db: DatabaseExecutor,
  where?: SQL,
  viewer?: ClaimViewer,
): Promise<TravelClaim[]> {
  const rows = await db
    .select({
      claim: travelClaims,
      fullName: users.fullName,
      deciderName: decider.fullName,
      payableStatus: payables.status,
      paidOn: payables.paidOn,
      projectCode: projects.code,
      day: travelDays,
    })
    .from(travelClaims)
    .innerJoin(users, eq(users.id, travelClaims.userId))
    .leftJoin(decider, eq(decider.id, travelClaims.decidedByUserId))
    .leftJoin(payables, eq(payables.id, travelClaims.payableId))
    .leftJoin(projects, eq(projects.id, travelClaims.projectId))
    .leftJoin(
      travelDays,
      and(
        eq(travelDays.userId, travelClaims.userId),
        eq(travelDays.workDate, travelClaims.workDate),
      ),
    )
    .where(where)
    .orderBy(desc(travelClaims.workDate), desc(travelClaims.createdAt));
  const mayDecide = await decidableBy(db, viewer, [
    ...new Set(
      rows.filter(({ claim }) => claim.status === 'pending').map(({ claim }) => claim.userId),
    ),
  ]);
  return rows.map(({ claim, fullName, deciderName, payableStatus, paidOn, projectCode, day }) => ({
    // The route facts come from the saved day, but the km paid are the claim's own, so the
    // km and the amount always agree. A claim made before its day was saved reads as straight.
    ...(day
      ? { ...kmOf(day), paidM: claim.distanceM }
      : {
          routeM: 0,
          straightM: claim.distanceM,
          paidM: claim.distanceM,
          method: 'straight' as const,
          capApplied: false,
          commuteDeductM: 0,
          gapCount: 0,
          gapMinutes: 0,
          mockedCount: 0,
        }),
    withdrawn: claim.withdrawnByResumeAt !== null,
    autoMade: claim.autoMade,
    autoApproved: claim.autoApproved,
    reviewReasons: claim.reviewReasons ?? [],
    id: claim.id,
    user: { id: claim.userId, fullName },
    workDate: claim.workDate,
    distanceM: claim.distanceM,
    ratePaisePerKm: claim.ratePaisePerKm,
    amountPaise: claim.amountPaise,
    visits: claim.visits,
    legs: claim.legs.map((leg) => ({ ...leg })),
    project: claim.projectId && projectCode ? { id: claim.projectId, code: projectCode } : null,
    note: claim.note,
    status: claim.status,
    paid: payableStatus === 'paid',
    paidOn: payableStatus === 'paid' ? (paidOn ?? null) : null,
    payableId: claim.payableId,
    decidedBy:
      claim.decidedByUserId && deciderName
        ? { id: claim.decidedByUserId, fullName: deciderName }
        : null,
    decidedAt: claim.decidedAt?.toISOString() ?? null,
    decisionNote: claim.decisionNote,
    voidedAt: claim.voidedAt?.toISOString() ?? null,
    voidReason: claim.voidReason,
    canDecide: claim.status === 'pending' && mayDecide.has(claim.userId),
    // Only finance or HR undo an approved claim; a manager decides a waiting one (S9, S10).
    canVoid:
      claim.status === 'approved' && payableStatus !== 'paid' && mayVoid(viewer, claim.userId),
    createdAt: claim.createdAt.toISOString(),
  }));
}
