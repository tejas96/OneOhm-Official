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
  readonly since: Date;
  /** When the wait ended (the work finished); null while still open. */
  readonly until: Date | null;
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

/** Builds the desk: open waits grouped by DISCOM, average wait per DISCOM and per step. */
export function buildDiscomDesk(
  waits: readonly DiscomWait[],
  master: readonly Discom[],
  today: string,
  openChangeRequests: number,
): DiscomDesk {
  const discomOf = (id: string | null) => master.find((row) => row.id === id) ?? null;
  const length = (wait: DiscomWait) =>
    Math.max(0, daysBetween(day(wait.since), wait.until ? day(wait.until) : today));
  const toItem = (wait: DiscomWait): DiscomDeskItem => ({
    kind: wait.kind,
    id: wait.id,
    title: wait.title,
    subject: wait.subject,
    href: wait.href,
    assignee: wait.assignee,
    waitingSince: wait.since.toISOString(),
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

  const byStep = new Map<string, { discomCode: string; step: string; days: number[] }>();
  for (const wait of waits.filter((entry) => entry.until)) {
    const discomCode = discomOf(wait.discomId)?.code ?? '—';
    const key = `${discomCode}|${wait.title}`;
    const entry = byStep.get(key) ?? { discomCode, step: wait.title, days: [] };
    entry.days.push(length(wait));
    byStep.set(key, entry);
  }
  const open = groups.flatMap((group) => group.waiting);
  return {
    groups: groups.sort((left, right) => right.waiting.length - left.waiting.length),
    stepAverages: [...byStep.values()]
      .map((entry) => ({
        discomCode: entry.discomCode,
        step: entry.step,
        averageDays: mean(entry.days),
        samples: entry.days.length,
      }))
      .sort((left, right) => right.averageDays - left.averageDays),
    totals: {
      waiting: open.length,
      followUpsDue: open.filter((item) => item.followUpDue).length,
      openChangeRequests,
    },
  };
}
