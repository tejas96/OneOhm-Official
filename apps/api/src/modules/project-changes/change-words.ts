import type { ProjectChangeKind, TaskPlan } from '@oneohm/domain';
import { formatInr, formatKwp } from '@oneohm/shared';

/** History lines say what changed in the team's words. */
const KIND_WORDS: Readonly<Record<ProjectChangeKind, string>> = {
  capacity: 'size',
  battery_added: 'battery added',
  battery_removed: 'battery removed',
  battery_changed: 'battery changed',
  panel: 'panels',
  inverter: 'inverter',
  structure: 'structure',
  extra_lines: 'extra lines',
};

export const kindsLine = (kinds: readonly string[]) =>
  kinds.map((kind) => KIND_WORDS[kind as ProjectChangeKind] ?? kind).join(', ');

export const signedInr = (paise: number) =>
  `${paise >= 0 ? '+' : '−'}${formatInr(Math.abs(paise))}`;

const days = (count: number) => (Math.abs(count) === 1 ? '1 day' : `${Math.abs(count)} days`);

/** "2 tasks added, 1 taken off; the finish moves 5 days later." */
export function tasksLine(plan: {
  readonly added: readonly unknown[];
  readonly removed: readonly unknown[];
  readonly kept: readonly unknown[];
  readonly finishMoveDays: number;
}) {
  const parts = [
    plan.added.length ? `${plan.added.length} added` : '',
    plan.removed.length ? `${plan.removed.length} taken off` : '',
    plan.kept.length ? `${plan.kept.length} already started, kept` : '',
  ].filter(Boolean);
  const finish =
    plan.finishMoveDays === 0
      ? 'the finish date stays'
      : `the finish moves ${days(plan.finishMoveDays)} ${plan.finishMoveDays > 0 ? 'later' : 'sooner'}`;
  return parts.length > 0
    ? `Tasks: ${parts.join(', ')}; ${finish}.`
    : `No task changes; ${finish}.`;
}

interface Totals {
  readonly totalPaise: number;
  readonly subsidyPaise: number;
  readonly capacityWp: number;
}

/** The history line once the customer accepted the change. */
export function acceptedLine(parts: {
  readonly number: number;
  readonly old: Totals;
  readonly next: Totals;
  readonly payment: { fits: boolean; last?: { label: string; amount: number } | undefined };
  readonly plan: TaskPlan;
  readonly store: string;
  readonly surveyAgain: boolean;
}): string {
  const { old, next, payment } = parts;
  const difference = next.totalPaise - old.totalPaise;
  const money =
    difference === 0
      ? 'The price stays the same.'
      : payment.fits && payment.last
        ? `${payment.last.label} is now ${formatInr(payment.last.amount + difference)}.`
        : 'Finance is asked to adjust the payment schedule.';
  const subsidy =
    next.subsidyPaise === old.subsidyPaise
      ? ''
      : `Expected subsidy ${formatInr(old.subsidyPaise)} → ${formatInr(next.subsidyPaise)}.`;
  return [
    `Customer accepted change ${parts.number}: ${formatKwp(old.capacityWp)} → ${formatKwp(next.capacityWp)}, price ${formatInr(old.totalPaise)} → ${formatInr(next.totalPaise)} (${signedInr(difference)}).`,
    money,
    subsidy,
    tasksLine(parts.plan),
    parts.store,
    parts.surveyAgain
      ? 'The survey price check runs again on the new scope: choose Recheck price.'
      : '',
  ]
    .filter(Boolean)
    .join(' ');
}
