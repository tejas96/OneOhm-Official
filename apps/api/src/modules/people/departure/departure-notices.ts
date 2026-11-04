import type { Notice } from '@oneohm/database';
import { daySpan } from '../../../common/notices';

/** What moved to the person covering, for the one notice they get. */
export interface Moved {
  readonly leads: number;
  readonly tasks: number;
  readonly serviceRequests: number;
  readonly discomSteps: number;
  readonly managedProjects: number;
  readonly teamProjects: number;
  readonly directReports: number;
  readonly chats: number;
  readonly leaveApprovals: number;
  readonly backupFor: number;
}

const count = (n: number, one: string, many: string) => (n === 1 ? `1 ${one}` : `${n} ${many}`);

/** The same wording as the leave-cover notice: "12 leads, 4 tasks are now yours." */
export function coveringBody(moved: Moved): string {
  const parts = [
    [moved.leads, 'lead', 'leads'],
    [moved.tasks, 'task', 'tasks'],
    [moved.serviceRequests, 'service request', 'service requests'],
    [moved.discomSteps, 'DISCOM step', 'DISCOM steps'],
    [moved.managedProjects, 'project to manage', 'projects to manage'],
    [moved.teamProjects, 'project team', 'project teams'],
    [moved.directReports, 'direct report', 'direct reports'],
    [moved.chats, 'WhatsApp chat', 'WhatsApp chats'],
    [moved.leaveApprovals, 'leave request to review', 'leave requests to review'],
    [moved.backupFor, 'leave to cover', 'leaves to cover'],
  ] as const;
  const said = parts.filter(([n]) => n > 0).map(([n, one, many]) => count(n, one, many));
  const total = parts.reduce((sum, [n]) => sum + n, 0);
  return `${said.join(', ')} ${total === 1 ? 'is' : 'are'} now yours.`;
}

export const movedTotal = (moved: Moved): number =>
  Object.values(moved).reduce((sum: number, n: number) => sum + n, 0);

/** The note on each project and lead that changed hands. */
export const handoverNote = (leaverName: string) =>
  `Handed over from ${leaverName} (left the team)`;

export const DEPARTURE_NOTICES = {
  covering: (leaverId: string, leaverName: string, moved: Moved, at: Date): Notice => ({
    kind: 'departure_cover',
    title: `You are now covering ${leaverName}'s work`,
    body: coveringBody(moved),
    dedupeKey: `departure_cover:${leaverId}:${at.getTime()}`,
  }),
  newBackup: (
    leave: { id: string; fromDate: string; toDate: string },
    leaverName: string,
    backup: { id: string; fullName: string },
  ): Notice => ({
    kind: 'leave_backup',
    title: `${backup.fullName} is now your backup`,
    body: `${leaverName} left the team, so ${backup.fullName} covers your leave ${daySpan(leave.fromDate, leave.toDate)}.`,
    subject: { type: 'leave', id: leave.id },
    dedupeKey: `leave_backup:${leave.id}:${backup.id}`,
  }),
};
