import { addDays, daysBetween } from '@oneohm/shared';

interface Span {
  readonly from: string;
  readonly to: string;
}

/** The facts a finished task is judged on (spec 3.7), all as India calendar dates. */
export interface TaskPointFacts {
  readonly dueDate: string;
  readonly startDate: string;
  /** The last hand-in that was accepted, not the day a reviewer approved it. */
  readonly handedInOn: string;
  /** `from` dates of reschedules the credited person made to their own task. */
  readonly selfMovedFrom: readonly string[];
  readonly outsideWaits: readonly (Span & { readonly party: string })[];
  /** The credited person's approved leave. */
  readonly leave: readonly Span[];
  readonly needsApproval: boolean;
  /** Times the work was sent back. */
  readonly returns: number;
}

export interface PartResult {
  readonly earned: boolean;
  readonly reason: string;
}

const PARTY: Readonly<Record<string, string>> = {
  bank: 'the bank',
  customer: 'the customer',
  discom: 'the DISCOM',
};

const days = (count: number) => `${count} ${count === 1 ? 'day' : 'days'}`;
const inSpan = (day: string, span: Span) => span.from <= day && day <= span.to;

/** Days between start and hand-in held up by an outside party, and by leave; each day once. */
function heldDays(facts: TaskPointFacts) {
  const outside = facts.outsideWaits.filter((wait) => wait.party !== 'internal');
  let waiting = 0;
  let leave = 0;
  for (let day = facts.startDate; day <= facts.handedInOn; day = addDays(day, 1)) {
    if (outside.some((wait) => inSpan(day, wait))) waiting += 1;
    else if (facts.leave.some((span) => inSpan(day, span))) leave += 1;
  }
  const parties = [...new Set(outside.map((wait) => wait.party))];
  const who = parties.length === 1 ? (PARTY[parties[0] ?? ''] ?? 'others') : 'others';
  return { waiting, leave, who };
}

function heldText(held: ReturnType<typeof heldDays>): string {
  const parts = [
    held.waiting > 0 ? `${days(held.waiting)} waiting on ${held.who}` : null,
    held.leave > 0 ? `${days(held.leave)} of leave` : null,
  ].filter(Boolean);
  return parts.join(' and ');
}

/**
 * Judges a finished task fairly (spec 3.7): on time against the due date the person
 * did not move themselves, moved later by outside waits and leave; first-time right
 * only where there is an approval step. Nothing here ever takes points away.
 */
export function judgeTask(facts: TaskPointFacts): {
  readonly onTime: PartResult & { readonly judgedDue: string; readonly daysLate: number };
  readonly firstTimeRight: PartResult | null;
} {
  const baseDue = [facts.dueDate, ...facts.selfMovedFrom].sort()[0] ?? facts.dueDate;
  const held = heldDays(facts);
  const judgedDue = addDays(baseDue, held.waiting + held.leave);
  const daysLate = Math.max(0, daysBetween(judgedDue, facts.handedInOn));
  const because = heldText(held);
  const onTime =
    daysLate === 0
      ? { earned: true, reason: because ? `On time (after ${because})` : 'On time' }
      : {
          earned: false,
          reason: `Late by ${days(daysLate)}${because ? ` after ${because}` : ''}: on-time not earned`,
        };
  const firstTimeRight = !facts.needsApproval
    ? null
    : facts.returns === 0
      ? { earned: true, reason: 'First-time right' }
      : {
          earned: false,
          reason: `Sent back ${facts.returns} ${facts.returns === 1 ? 'time' : 'times'}: first-time right not earned`,
        };
  return { onTime: { ...onTime, judgedDue, daysLate }, firstTimeRight };
}
