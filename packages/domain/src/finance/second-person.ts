import { formatInr } from '@oneohm/shared';

/**
 * Two people above a limit. A bank transfer above the limit in Settings needs the sender
 * plus one other person who took part: they approved the bill, or asked to send it.
 */
export function needsSecondPerson(amountPaise: number, limitPaise: number): boolean {
  return limitPaise > 0 && amountPaise > limitPaise;
}

/** True when someone other than the sender approved the bill or asked to send it. */
export function secondPersonMet(input: {
  senderId: string;
  approvedByUserId: string | null;
  askedByUserId: string | null;
}): boolean {
  const others = [input.approvedByUserId, input.askedByUserId];
  return others.some((id) => id !== null && id !== input.senderId);
}

/** True when this send must be refused for want of a second person. */
export function secondPersonMissing(input: {
  amountPaise: number;
  limitPaise: number;
  senderId: string;
  approvedByUserId: string | null;
  askedByUserId: string | null;
}): boolean {
  return needsSecondPerson(input.amountPaise, input.limitPaise) && !secondPersonMet(input);
}

const list = (names: readonly string[]): string => {
  const shown = names.slice(0, 3).join(', ');
  return names.length > 3 ? `${shown} and ${names.length - 3} more` : shown;
};

/** The refusal, naming who can help. Names are worked out by the caller. */
export function secondPersonText(
  limitPaise: number,
  askNames: readonly string[],
  sendNames: readonly string[],
): string {
  const ask = askNames.length > 0 ? list(askNames) : 'another person with record or approve rights';
  const send = sendNames.length > 0 ? list(sendNames) : 'another approver';
  return `Above ${formatInr(limitPaise)}, two people must take part. Ask ${ask} to press Ask to send, or ask ${send} to send it.`;
}

/** A person who could be the sender or the second person. */
export interface Helper {
  readonly userId: string;
  readonly canApprove: boolean;
  readonly canRecord: boolean;
}

/**
 * Turning the rule on is allowed only if two people can really cover it: one who approves
 * payments (the sender) and a different active person who approves or records payments.
 * Returns the plain-words problem, or null.
 */
export function secondPersonSetupProblem(people: readonly Helper[]): string | null {
  const senders = people.filter((person) => person.canApprove);
  const covered = senders.some((sender) =>
    people.some((other) => other.userId !== sender.userId && (other.canApprove || other.canRecord)),
  );
  return covered
    ? null
    : 'Two people are needed for this rule. Add another active person who approves or records payments first, or you could lock yourself out.';
}
