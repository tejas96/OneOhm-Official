import type { TravelClaim, TravelDay } from '@oneohm/api-contracts';
import {
  attendanceDays,
  type DatabaseExecutor,
  payables,
  siteVisits,
  travelClaims,
  users,
  workLocations,
} from '@oneohm/database';
import {
  type GeoPoint,
  nearestLocation,
  orderStops,
  type TravelStop,
  travelAmountPaise,
  travelDistanceM,
  travelLegs,
  type WorkforcePolicy,
} from '@oneohm/domain';
import { todayIn } from '@oneohm/shared';
import { and, desc, eq, type SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { activeLocations } from '../workforce/policy';
import { checkInPoint, visitRecords } from './site-visit-read';

const point = (latitude: number | null, longitude: number | null): GeoPoint | null =>
  latitude !== null && longitude !== null ? { latitude, longitude } : null;

/** The day's check-in and check-out at an authorised place: where travel starts and ends. */
async function dayEnds(db: DatabaseExecutor, userId: string, date: string): Promise<TravelStop[]> {
  const [day] = await db
    .select({ day: attendanceDays, place: workLocations.name })
    .from(attendanceDays)
    .leftJoin(workLocations, eq(workLocations.id, attendanceDays.checkInLocationId))
    .where(and(eq(attendanceDays.userId, userId), eq(attendanceDays.workDate, date)))
    .limit(1);
  if (!day) return [];
  const stops: TravelStop[] = [];
  const start = point(day.day.checkInLatitude, day.day.checkInLongitude);
  if (start && day.day.checkInInside && day.place)
    stops.push({
      id: 'start',
      kind: 'start',
      label: day.place,
      at: day.day.checkInAt.toISOString(),
      point: start,
    });
  const end = point(day.day.checkOutLatitude, day.day.checkOutLongitude);
  if (end && day.day.checkOutAt && day.day.checkOutInside) {
    const place = nearestLocation(end, await activeLocations(db));
    stops.push({
      id: 'end',
      kind: 'end',
      label: place?.location.name ?? day.place ?? 'Check-out',
      at: day.day.checkOutAt.toISOString(),
      point: end,
    });
  }
  return stops;
}

/**
 * One person's travel on a day (PRD 4.3): the office check-in, each site check-in in
 * order, and the office check-out, with straight-line distances between them.
 */
export async function travelDay(
  db: DatabaseExecutor,
  userId: string,
  date: string,
  policy: WorkforcePolicy,
): Promise<TravelDay> {
  const where = and(eq(siteVisits.userId, userId), eq(siteVisits.workDate, date)) as SQL;
  const [visits, rows, ends, claims] = await Promise.all([
    visitRecords(db, where),
    db.select().from(siteVisits).where(where),
    dayEnds(db, userId, date),
    readClaims(db, and(eq(travelClaims.userId, userId), eq(travelClaims.workDate, date)) as SQL),
  ]);
  const ordered = [...visits].sort((left, right) => left.checkInAt.localeCompare(right.checkInAt));
  const stops = orderStops([
    ...ends,
    ...ordered.map((visit): TravelStop => {
      const row = rows.find((entry) => entry.id === visit.id);
      return {
        id: visit.id,
        kind: 'visit',
        label: [visit.projectCode, visit.taskTitle].filter(Boolean).join(' · ') || 'Site visit',
        at: visit.checkInAt,
        point: row ? checkInPoint(row) : null,
      };
    }),
  ]);
  const legs = ordered.length > 0 ? travelLegs(stops) : [];
  const distanceM = travelDistanceM(legs);
  const rate = policy.travel.ratePaisePerKm;
  const amountPaise = travelAmountPaise(distanceM, rate);
  const live = claims.find((claim) => claim.status === 'pending' || claim.status === 'approved');
  return {
    workDate: date,
    visits: ordered,
    legs: legs.map(({ fromLabel, toLabel, distanceM: metres }) => ({
      fromLabel,
      toLabel,
      distanceM: metres,
    })),
    distanceM,
    ratePaisePerKm: rate,
    amountPaise,
    unlocated: ordered.filter((visit) => visit.locationNote === 'not_shared').length,
    claim: live ?? claims[0] ?? null,
    claimable: !live && amountPaise > 0 && date <= todayIn(),
  };
}

const decider = alias(users, 'decider');

/** Claims with who made and decided them, and whether finance has paid them. */
export async function readClaims(db: DatabaseExecutor, where?: SQL): Promise<TravelClaim[]> {
  const rows = await db
    .select({
      claim: travelClaims,
      fullName: users.fullName,
      deciderName: decider.fullName,
      payableStatus: payables.status,
      paidOn: payables.paidOn,
    })
    .from(travelClaims)
    .innerJoin(users, eq(users.id, travelClaims.userId))
    .leftJoin(decider, eq(decider.id, travelClaims.decidedByUserId))
    .leftJoin(payables, eq(payables.id, travelClaims.payableId))
    .where(where)
    .orderBy(desc(travelClaims.workDate), desc(travelClaims.createdAt));
  return rows.map(({ claim, fullName, deciderName, payableStatus, paidOn }) => ({
    id: claim.id,
    user: { id: claim.userId, fullName },
    workDate: claim.workDate,
    distanceM: claim.distanceM,
    ratePaisePerKm: claim.ratePaisePerKm,
    amountPaise: claim.amountPaise,
    visits: claim.visits,
    legs: claim.legs.map((leg) => ({ ...leg })),
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
    createdAt: claim.createdAt.toISOString(),
  }));
}
