import type { TrackingStatus } from '@oneohm/api-contracts';
import { type DatabaseExecutor, locationConsents } from '@oneohm/database';
import {
  consentIsCurrent,
  inLocationWindow,
  LOCATION_CONSENT_VERSION,
  type WorkforcePolicy,
} from '@oneohm/domain';
import { eq } from 'drizzle-orm';
import { indiaTime, loadPolicy } from './policy';

export interface Position {
  latitude: number;
  longitude: number;
  accuracyM?: number | null | undefined;
}

type ConsentRow = typeof locationConsents.$inferSelect;

async function consentRow(db: DatabaseExecutor, userId: string): Promise<ConsentRow | null> {
  const [row] = await db
    .select()
    .from(locationConsents)
    .where(eq(locationConsents.userId, userId))
    .limit(1);
  return row ?? null;
}

/** Given for the words shown today; answered once the person has said yes or no to them. */
export function consentSummary(row: ConsentRow | null) {
  const given = consentIsCurrent(row);
  const answered = Boolean(row) && (Boolean(row?.withdrawnAt) || given);
  return {
    given,
    answered,
    at: given ? (row?.consentedAt ?? null) : null,
    version: row?.consentedAt && !row.withdrawnAt ? row.textVersion : null,
  };
}

function stateOf(policy: WorkforcePolicy, given: boolean, at: Date): TrackingStatus['state'] {
  if (!policy.attendance.captureLocation) return 'policy_off';
  if (!given) return 'no_consent';
  const open = inLocationWindow(indiaTime(at), policy.attendance, policy.travel.hoursMarginMinutes);
  return open ? 'on' : 'outside_hours';
}

/**
 * Whether the phone's location may be read for this person now (PRD 4.3): consent to
 * the current words, the policy on, and within working hours. Nothing else reads it.
 */
export async function trackingFor(
  db: DatabaseExecutor,
  userId: string,
  at: Date = new Date(),
): Promise<{ status: TrackingStatus; policy: WorkforcePolicy }> {
  const [policy, row] = await Promise.all([loadPolicy(db), consentRow(db, userId)]);
  const consent = consentSummary(row);
  const state = stateOf(policy, consent.given, at);
  const margin = policy.travel.hoursMarginMinutes;
  return {
    policy,
    status: {
      state,
      consentVersion: LOCATION_CONSENT_VERSION,
      consentGivenVersion: consent.version,
      consentAt: consent.at?.toISOString() ?? null,
      answered: consent.answered,
      hours: {
        from: shift(policy.attendance.dayStart, -margin),
        to: shift(policy.attendance.dayEnd, margin),
      },
      retentionDays: policy.attendance.retentionDays,
    },
  };
}

/** "09:30" moved by minutes, kept within the day. */
function shift(time: string, minutes: number): string {
  const [hours = 0, mins = 0] = time.split(':').map(Number);
  const total = Math.min(Math.max(hours * 60 + mins + minutes, 0), 23 * 60 + 59);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

/** The reading to keep, or null when location may not be kept for this person now. */
export async function usableReading(
  db: DatabaseExecutor,
  userId: string,
  position: Position | null | undefined,
  at: Date = new Date(),
): Promise<{ position: Position; policy: WorkforcePolicy } | null> {
  const { status, policy } = await trackingFor(db, userId, at);
  if (!position || status.state !== 'on') return null;
  return { position, policy };
}
