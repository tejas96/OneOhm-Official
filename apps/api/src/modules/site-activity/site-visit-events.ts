import { type DatabaseExecutor, notify, projectActivities } from '@oneohm/database';
import type { SiteTask } from './site-task';
import { distanceWords, durationWords } from './site-visit-read';

interface VisitFacts {
  readonly visitId: string;
  readonly userId: string;
  readonly fullName: string;
  readonly distanceM: number | null;
  readonly far: boolean | null;
  /** The phone's location was kept (with consent, in working hours). */
  readonly located: boolean;
}

/** "Checked in at the site for Panel installation · 40 m from the site" in the project history. */
export async function noteCheckIn(db: DatabaseExecutor, task: SiteTask, visit: VisitFacts) {
  await db.insert(projectActivities).values({
    projectId: task.projectId,
    taskId: task.id,
    kind: 'site_check_in',
    message: `Checked in at the site for ${task.title} · ${distanceWords(visit.distanceM, visit.far, visit.located)}.`,
    userId: visit.userId,
    data: { visitId: visit.visitId, distanceM: visit.distanceM, far: visit.far },
  });
  // A far check-in is flagged to the project manager, never refused (PRD 4.3).
  if (visit.far && task.managerUserId && task.managerUserId !== visit.userId) {
    await notify(
      db,
      { userId: task.managerUserId },
      {
        kind: 'site_check_in_far',
        title: 'Check-in far from the site',
        body: `${visit.fullName} · ${task.title} · ${task.projectCode}: ${distanceWords(visit.distanceM, true)}.`,
        subject: { type: 'task', id: task.id, projectId: task.projectId },
        dedupeKey: `site_check_in_far:${visit.visitId}`,
      },
    );
  }
}

export async function noteCheckOut(
  db: DatabaseExecutor,
  task: SiteTask,
  visit: VisitFacts & { readonly minutes: number },
) {
  const away = visit.far ? `, ${distanceWords(visit.distanceM, true)}` : '';
  await db.insert(projectActivities).values({
    projectId: task.projectId,
    taskId: task.id,
    kind: 'site_check_out',
    message: `Checked out of the site for ${task.title} after ${durationWords(visit.minutes)}${away}.`,
    userId: visit.userId,
    data: { visitId: visit.visitId, minutes: visit.minutes, far: visit.far },
  });
}

export async function noteSiteSaved(db: DatabaseExecutor, task: SiteTask, userId: string) {
  await db.insert(projectActivities).values({
    projectId: task.projectId,
    taskId: task.id,
    kind: 'site_location',
    message: `Site location saved from the check-in for ${task.title}.`,
    userId,
  });
}
