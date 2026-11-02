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
  /** Reschedules the credited person made to their own task (`from` → `to`). */
  readonly selfMoves: readonly Span[];
  /** Waits as ISO instants; only real time counts, overlaps once (spec 3.7). */
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
  reviewer: 'the reviewer',
};

const days = (count: number) => `${count} ${count === 1 ? 'day' : 'days'}`;
const inSpan = (day: string, span: Span) => span.from <= day && day <= span.to;

const DAY_MS = 86_400_000;
/** Midnight in India for a calendar date, as epoch milliseconds. */
const indiaMidnight = (date: string) => Date.parse(`${date}T00:00:00+05:30`);

/**
 * Time held up between start and hand-in: outside waits by their real length (merged,
 * so overlaps count once, then whole days, so a short "waiting" never earns a day),
 * and approved leave days on days no outside wait touched.
 */
function heldDays(facts: TaskPointFacts) {
  const windowStart = indiaMidnight(facts.startDate);
  const windowEnd = indiaMidnight(addDays(facts.handedInOn, 1));
  const outside = facts.outsideWaits.filter((wait) => wait.party !== 'internal');
  const spans = outside
    .map((wait) => ({
      from: Math.max(windowStart, Date.parse(wait.from)),
      to: Math.min(windowEnd, Date.parse(wait.to)),
    }))
    .filter((span) => span.to > span.from)
    .sort((a, b) => a.from - b.from);
  let heldMs = 0;
  let cursor = Number.NEGATIVE_INFINITY;
  for (const span of spans) {
    const from = Math.max(span.from, cursor);
    if (span.to > from) heldMs += span.to - from;
    cursor = Math.max(cursor, span.to);
  }
  const waiting = Math.floor(heldMs / DAY_MS);
  let leave = 0;
  for (let day = facts.startDate; day <= facts.handedInOn; day = addDays(day, 1)) {
    const dayStart = indiaMidnight(day);
    const touched = spans.some((span) => span.from < dayStart + DAY_MS && span.to > dayStart);
    if (!touched && facts.leave.some((span) => inSpan(day, span))) leave += 1;
  }
  const parties = [...new Set(outside.map((wait) => wait.party))];
  const who = parties.length === 1 ? (PARTY[parties[0] ?? ''] ?? 'others') : 'others';
  return { waiting, leave, who };
}

function heldText(held: ReturnType<typeof heldDays>): string {
  const parts = [
    held.waiting > 0
      ? `${days(held.waiting)} ${held.who === 'the reviewer' ? 'with' : 'waiting on'} ${held.who}`
      : null,
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
  // Only the days the person pushed their own date out are taken back; later moves by a
  // manager or an earlier late task stand.
  const selfAdded = facts.selfMoves.reduce(
    (sum, move) => sum + Math.max(0, daysBetween(move.from, move.to)),
    0,
  );
  const baseDue = addDays(facts.dueDate, -selfAdded);
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
