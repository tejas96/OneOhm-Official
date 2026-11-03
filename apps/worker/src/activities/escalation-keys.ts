/**
 * Dedupe keys for manager alerts. The recipient is part of the key: when a project changes
 * hands, the new manager hears what the old one already did. With no (active) manager the
 * alert goes to the people who hold the right, named `holders`.
 */
export type EscalationKeyInput =
  | { kind: 'late'; taskId: string; managerUserId: string | null }
  | { kind: 'stuck'; taskId: string; since: string; managerUserId: string | null }
  | { kind: 'leave-block'; taskId: string; from: string; managerUserId: string | null };

export function escalationKey(input: EscalationKeyInput): string {
  const who = input.managerUserId ?? 'holders';
  if (input.kind === 'late') return `escalate:${input.taskId}:manager:${who}`;
  if (input.kind === 'stuck') return `stuck:${input.taskId}:${input.since}:${who}`;
  return `leave-block:${input.taskId}:${input.from}:${who}`;
}
