import { customerActions, type DatabaseExecutor, documents, projectFacts } from '@oneohm/database';
import {
  missingItems,
  PHOTO_CAPTION,
  SURVEY_PHOTOS,
  type SurveyItem,
  type SurveyPhoto,
  surveyFacts,
} from '@oneohm/domain';
import { and, eq } from 'drizzle-orm';
import { recordAudit } from '../../common/audit';
import { logAction } from '../documents/customer-action-log';
import { alertTaskOwner, taskFor } from '../journey/journey-store';
import { filePaper } from '../whatsapp/file-paper';
import {
  homeOfProject,
  payloadOf,
  type SurveyAction,
  surveyTaskOf,
  updateSurvey,
} from './survey-record';

/** The photo items already given, in the order they are asked. */
export const givenPhotos = (photos: Partial<Record<SurveyPhoto, string>>): SurveyPhoto[] =>
  SURVEY_PHOTOS.filter((item) => Boolean(photos[item]));

/**
 * What is still missing from this survey (the consumer number only when the home has none). An item the engineer
 * asked again counts as missing until the customer gives it again.
 */
export async function missingOf(db: DatabaseExecutor, action: SurveyAction): Promise<SurveyItem[]> {
  const payload = payloadOf(action);
  const again = new Set<string>(payload.askAgain);
  const home = action.projectId ? await homeOfProject(db, action.projectId) : null;
  const answers = Object.fromEntries(
    Object.entries(payload.answers).filter(([key]) => !again.has(key)),
  );
  return missingItems(
    answers,
    givenPhotos(payload.photos).filter((item) => !again.has(item)),
    Boolean(home?.consumerNumber) && !again.has('consumer'),
  );
}

/**
 * The survey is saved where a field survey goes (redesign §7): the answers as the survey's report fields
 * (project facts), the photos as site photos on the home with their captions, on the survey task. A photo
 * asked again takes the old one off the task (the file is kept).
 */
async function saveReport(tx: DatabaseExecutor, action: SurveyAction): Promise<void> {
  const payload = payloadOf(action);
  const task = action.projectId ? await surveyTaskOf(tx, action.projectId) : null;
  const home = action.projectId ? await homeOfProject(tx, action.projectId) : null;
  if (!task || !home || !action.projectId) return;
  for (const [key, value] of Object.entries(surveyFacts(payload.answers)))
    await tx
      .insert(projectFacts)
      .values({ projectId: action.projectId, key, value })
      .onConflictDoUpdate({
        target: [projectFacts.projectId, projectFacts.key],
        set: { value, updatedAt: new Date() },
      });
  for (const item of SURVEY_PHOTOS) {
    const id = payload.photos[item];
    if (!id) continue;
    const [file] = await tx.select().from(documents).where(eq(documents.id, id));
    if (!file || file.taskId === task.id) continue;
    // Taken off the task: an older photo of the same item (asked again).
    await tx
      .update(documents)
      .set({ removedAt: new Date() })
      .where(and(eq(documents.taskId, task.id), eq(documents.name, captionFor(item, file.name))));
    await filePaper(tx, id, {
      projectId: action.projectId,
      propertyId: home.propertyId,
      category: 'site_photo',
    });
    await tx
      .update(documents)
      .set({ taskId: task.id, name: captionFor(item, file.name) })
      .where(eq(documents.id, id));
  }
}

/** "Self survey: roof corner A.jpg": the caption with the file's own extension. */
const captionFor = (item: SurveyPhoto, fileName: string) =>
  `${PHOTO_CAPTION[item]}${/\.[A-Za-z0-9]{2,5}$/.exec(fileName)?.[0] ?? ''}`;

/**
 * The customer sent the survey: when nothing is missing it is saved as the survey report, the ask waits
 * for the check ("Self survey received - check it") and the survey step's owner is told. Returns what is
 * still missing otherwise. Runs in one transaction; sending twice changes nothing.
 */
export async function sendSurvey(
  tx: DatabaseExecutor,
  action: SurveyAction,
): Promise<{ readonly sent: true } | { readonly sent: false; readonly missing: SurveyItem[] }> {
  const missing = await missingOf(tx, action);
  if (missing.length > 0) return { sent: false, missing };
  const now = new Date();
  const [moved] = await tx
    .update(customerActions)
    .set({ status: 'received', doneAt: now, updatedAt: now })
    .where(and(eq(customerActions.id, action.id), eq(customerActions.status, 'open')))
    .returning();
  if (!moved) return { sent: true };
  await updateSurvey(tx, action.id, () => ({
    sentAt: now.toISOString(),
    awaiting: null,
    askAgain: [],
  }));
  await saveReport(tx, moved);
  await logAction(
    tx,
    { projectId: moved.projectId, leadId: null },
    {
      kind: 'customer_action',
      message: 'Self survey received: answers and photos are on the survey step. Please check it.',
      userId: null,
      data: { customerActionId: moved.id },
    },
  );
  await recordAudit(tx, null, 'customer_action.self_survey_received', 'customer_action', moved.id);
  const task = moved.taskId ? await taskFor(tx, moved.taskId) : null;
  if (task)
    await alertTaskOwner(tx, task, {
      kind: 'self_survey_received',
      title: 'Self survey received - check it',
      body: `${task.title}: the customer sent their answers and photos. Approve it, ask for something again, or book a visit.`,
      key: `self_survey_received:${moved.id}:${now.getTime()}`,
    });
  return { sent: true };
}
