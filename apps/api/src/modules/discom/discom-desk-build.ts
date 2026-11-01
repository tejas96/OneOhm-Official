import type { DiscomDesk, DiscomDeskItem } from '@oneohm/api-contracts';
import type { discoms } from '@oneohm/database';
import { daysBetween } from '@oneohm/shared';

type Discom = typeof discoms.$inferSelect;

/** A project task or change-request step that waited (or waits) on a DISCOM. */
export interface DiscomWait {
  readonly kind: DiscomDeskItem['kind'];
  readonly id: string;
  readonly title: string;
  readonly subject: string;
  readonly href: string;
  readonly assignee: DiscomDeskItem['assignee'];
  readonly discomId: string | null;
  /** Start of the current wait; null when the work was resumed and is not waiting now. */
  readonly since: Date | null;
  /** When the current wait ended (the work finished); null while still open. */
  readonly until: Date | null;
  /** Earlier waits on the DISCOM, kept when the work was resumed (PRD 3.16). */
  readonly earlier: readonly { readonly from: Date; readonly to: Date }[];
  /** The work is done, so its DISCOM time is final and counts in step averages. */
  readonly finished: boolean;
  /** Still waiting right now, so it belongs on the desk. */
  readonly waitingNow: boolean;
  readonly referenceNumber: string | null;
  readonly office: string | null;
  readonly nextFollowUpOn: string | null;
  readonly note: string | null;
}

const day = (moment: Date) => moment.toISOString().slice(0, 10);
const round1 = (value: number) => Math.round(value * 10) / 10;
const mean = (values: readonly number[]) =>
  round1(values.reduce((sum, value) => sum + value, 0) / values.length);

/** Days a piece of work has waited on the DISCOM: every earlier wait plus the current one. */
export function waitedDays(wait: DiscomWait, today: string): number {
  const span = (from: Date, to: string) => Math.max(0, daysBetween(day(from), to));
  const earlier = wait.earlier.reduce((sum, part) => sum + span(part.from, day(part.to)), 0);
  const current = wait.since ? span(wait.since, wait.until ? day(wait.until) : today) : 0;
  return earlier + current;
}

/** Mean days per key, longest first; keys with no waits are left out. */
function averagesBy<K extends Record<string, string>>(
  waits: readonly DiscomWait[],
  keyOf: (wait: DiscomWait) => K | null,
  length: (wait: DiscomWait) => number,
): (K & { averageDays: number; samples: number })[] {
  const groups = new Map<string, { key: K; days: number[] }>();
  for (const wait of waits) {
    const key = keyOf(wait);
    if (!key) continue;
    const id = Object.values(key).join('|').toLowerCase();
    const entry = groups.get(id) ?? { key, days: [] };
    entry.days.push(length(wait));
    groups.set(id, entry);
  }
  return [...groups.values()]
    .map((entry) => ({ ...entry.key, averageDays: mean(entry.days), samples: entry.days.length }))
    .sort((left, right) => right.averageDays - left.averageDays);
}

/** Builds the desk: open waits grouped by DISCOM, average wait per DISCOM and per step. */
export function buildDiscomDesk(
  waits: readonly DiscomWait[],
  master: readonly Discom[],
  today: string,
  openChangeRequests: number,
): DiscomDesk {
  const discomOf = (id: string | null) => master.find((row) => row.id === id) ?? null;
  const length = (wait: DiscomWait) => waitedDays(wait, today);
  const toItem = (wait: DiscomWait): DiscomDeskItem => ({
    kind: wait.kind,
    id: wait.id,
    title: wait.title,
    subject: wait.subject,
    href: wait.href,
    assignee: wait.assignee,
    waitingSince: wait.since?.toISOString() ?? null,
    ageDays: length(wait),
    expectedDays: discomOf(wait.discomId)?.expectedDays ?? 30,
    referenceNumber: wait.referenceNumber,
    office: wait.office,
    nextFollowUpOn: wait.nextFollowUpOn,
    followUpDue: wait.nextFollowUpOn !== null && wait.nextFollowUpOn <= today,
    note: wait.note,
  });

  const groups = [...new Set(waits.map((wait) => wait.discomId))].map((discomId) => {
    const discom = discomOf(discomId);
    const mine = waits.filter((wait) => wait.discomId === discomId);
    return {
      discom: discom ? { id: discom.id, code: discom.code, name: discom.name } : null,
      expectedDays: discom?.expectedDays ?? 30,
      averageWaitDays: mine.length ? mean(mine.map(length)) : null,
      samples: mine.length,
      waiting: mine
        .filter((wait) => wait.waitingNow)
        .map(toItem)
        .sort((left, right) => right.ageDays - left.ageDays),
    };
  });

  const code = (wait: DiscomWait) => discomOf(wait.discomId)?.code ?? '—';
  const open = groups.flatMap((group) => group.waiting);
  return {
    groups: groups.sort((left, right) => right.waiting.length - left.waiting.length),
    stepAverages: averagesBy(
      waits.filter((wait) => wait.finished),
      (wait) => ({ discomCode: code(wait), step: wait.title }),
      length,
    ),
    // Offices as written on follow-ups; finished and still-waiting work both count.
    officeAverages: averagesBy(
      waits,
      (wait) => {
        const office = wait.office?.trim();
        return office ? { discomCode: code(wait), office } : null;
      },
      length,
    ),
    totals: {
      waiting: open.length,
      followUpsDue: open.filter((item) => item.followUpDue).length,
      openChangeRequests,
    },
  };
}
