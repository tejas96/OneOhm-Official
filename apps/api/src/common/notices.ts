import type { Notice } from '@oneohm/database';

const dayLabel = new Intl.DateTimeFormat('en-IN', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
});

/** "Mon, 9 Nov", or "Mon, 9 Nov – Tue, 10 Nov" for a range. */
export function daySpan(from: string, to: string): string {
  const one = (date: string) => dayLabel.format(new Date(`${date}T00:00:00Z`));
  return from === to ? one(from) : `${one(from)} – ${one(to)}`;
}

interface TaskRef {
  readonly id: string;
  readonly title: string;
  readonly projectId: string;
}

const taskSubject = (task: TaskRef) =>
  ({ type: 'task', id: task.id, projectId: task.projectId }) as const;

/** The words staff see in the inbox and on their phone, one builder per event. */
export const STAFF_NOTICES = {
  taskAssigned: (task: TaskRef, projectCode: string, stamp: string): Notice => ({
    kind: 'task_assigned',
    title: 'New task for you',
    body: `${task.title} · ${projectCode}`,
    subject: taskSubject(task),
    dedupeKey: `task_assigned:${task.id}:${stamp}`,
  }),
  projectTasks: (projectId: string, code: string, count: number, userId: string): Notice => ({
    kind: 'project_tasks',
    title: `New project ${code}`,
    body: count === 1 ? 'You have 1 task on it.' : `You have ${count} tasks on it.`,
    subject: { type: 'project', id: projectId, projectId },
    dedupeKey: `project_tasks:${projectId}:${userId}`,
  }),
  taskNeedsApproval: (task: TaskRef, by: string, stamp: string): Notice => ({
    kind: 'task_review',
    title: 'Waiting for your approval',
    body: `${task.title}, sent by ${by}.`,
    subject: taskSubject(task),
    dedupeKey: `task_review:${task.id}:${stamp}`,
  }),
  taskApproved: (task: TaskRef): Notice => ({
    kind: 'task_approved',
    title: 'Task approved',
    body: task.title,
    subject: taskSubject(task),
    dedupeKey: `task_approved:${task.id}`,
  }),
  leaveRequested: (id: string, name: string, from: string, to: string): Notice => ({
    kind: 'leave_requested',
    title: 'Leave request',
    body: `${name}: ${daySpan(from, to)}.`,
    subject: { type: 'leave', id },
    dedupeKey: `leave_requested:${id}`,
  }),
  leaveDecided: (id: string, approved: boolean, from: string, to: string): Notice => ({
    kind: 'leave_decided',
    title: approved ? 'Leave approved' : 'Leave not approved',
    body: daySpan(from, to),
    subject: { type: 'leave', id },
    dedupeKey: `leave_decided:${id}`,
  }),
  covering: (id: string, name: string, tasks: number): Notice => ({
    kind: 'leave_cover',
    title: `You are covering for ${name}`,
    body: tasks === 1 ? '1 task is now yours.' : `${tasks} tasks are now yours.`,
    subject: { type: 'leave', id },
    dedupeKey: `leave_cover:${id}`,
  }),
  correctionRequested: (id: string, name: string, date: string): Notice => ({
    kind: 'correction_requested',
    title: 'Attendance correction',
    body: `${name} asks to correct ${daySpan(date, date)}.`,
    subject: { type: 'correction', id },
    dedupeKey: `correction_requested:${id}`,
  }),
  correctionDecided: (id: string, approved: boolean, date: string): Notice => ({
    kind: 'correction_decided',
    title: approved ? 'Correction approved' : 'Correction not approved',
    body: daySpan(date, date),
    subject: { type: 'correction', id },
    dedupeKey: `correction_decided:${id}`,
  }),
  pointsApproved: (id: string, points: number, reason: string): Notice => ({
    kind: 'points_approved',
    title: `You earned ${points} points`,
    body: reason,
    subject: { type: 'points', id },
    dedupeKey: `points_approved:${id}`,
  }),
} as const;
