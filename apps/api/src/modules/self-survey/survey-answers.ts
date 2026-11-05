import {
  customerActions,
  type DatabaseExecutor,
  homeNameOf,
  readBusinessSetting,
} from '@oneohm/database';
import {
  consumerNumberProblem,
  isOption,
  normalizeConsumerNumber,
  offerPaise,
  type SurveyItem,
  type SurveyPhoto,
} from '@oneohm/domain';
import { and, desc, eq, sql } from 'drizzle-orm';
import { recordAudit } from '../../common/audit';
import { logAction } from '../documents/customer-action-log';
import { type JourneyTask, taskFor } from '../journey/journey-store';
import { openVisitForTask } from '../visits/visit-reads';
import { MEDIA_WORDS } from '../whatsapp/assistant/words';
import {
  EMPTY_SURVEY,
  liveSurveyOf,
  payloadOf,
  type SurveyAction,
  surveyTarget,
  surveyTaskOf,
  updateSurvey,
} from './survey-record';

/** The first answer or photo marks the survey as started (Home keeps "Finish your survey" for 7 days from then). */
const started = (current: { startedAt: string | null }) =>
  current.startedAt ? {} : { startedAt: new Date().toISOString() };

/** Saves a tapped choice (roof, floors, shade, size); false when the value is not one of the options. */
export async function saveChoice(
  tx: DatabaseExecutor,
  id: string,
  question: string,
  value: string,
): Promise<boolean> {
  if (
    !(question === 'roof' || question === 'floors' || question === 'shade' || question === 'size')
  )
    return false;
  if (!isOption(question, value)) return false;
  await updateSurvey(tx, id, (now) => ({
    ...started(now),
    answers: { ...now.answers, [question]: value },
    askAgain: now.askAgain.filter((item) => item !== question),
    awaiting: null,
  }));
  return true;
}

/** Saves the typed consumer number; the reason it was refused otherwise. */
export async function saveConsumer(
  tx: DatabaseExecutor,
  id: string,
  typed: string,
): Promise<'ok' | 'bad'> {
  const number = normalizeConsumerNumber(typed);
  if (consumerNumberProblem(number)) return 'bad';
  await updateSurvey(tx, id, (now) => ({
    ...started(now),
    answers: { ...now.answers, consumer: number },
    askAgain: now.askAgain.filter((item) => item !== 'consumer'),
    awaiting: null,
  }));
  return 'ok';
}

/** Saves a photo (the customer's stored file). An older photo of the item (asked again) is taken off its home. */
export async function savePhoto(
  tx: DatabaseExecutor,
  id: string,
  item: SurveyPhoto,
  documentId: string,
): Promise<void> {
  await updateSurvey(tx, id, (current) => ({
    ...started(current),
    photos: { ...current.photos, [item]: documentId },
    askAgain: current.askAgain.filter((one) => one !== item),
    awaiting: null,
  }));
}

/** The survey item the chat waits on, as a stored file or typed words (null for none). */
export const awaitingOf = (action: SurveyAction): SurveyItem | null => payloadOf(action).awaiting;

/** The chat now waits for this item. */
export async function waitFor(tx: DatabaseExecutor, id: string, item: SurveyItem | null) {
  await updateSurvey(tx, id, () => ({ awaiting: item }));
}

/**
 * Home's "Start survey" with no ask yet: the ask is made now (the system asks, nobody on the team). Only for a
 * project's survey step the customer may be messaged about, with no visit booked, while the offer is on.
 */
export async function startFromHome(
  tx: DatabaseExecutor,
  customerId: string,
  taskId: string,
): Promise<SurveyAction | null> {
  const task = await taskFor(tx, taskId);
  if (!task || task.status === 'completed' || !task.notifyCustomer) return null;
  if ((await surveyTaskOf(tx, task.projectId))?.id !== task.id) return null;
  const earlier = await liveSurveyOf(tx, task.id);
  if (earlier)
    return earlier.customerId === customerId && earlier.status === 'open' ? earlier : null;
  const paise = offerPaise(await readBusinessSetting(tx, 'reminders'));
  if (paise <= 0 || (await openVisitForTask(tx, task.id))) return null;
  const home = await homeNameOf(tx, task.projectId);
  const [row] = await tx
    .insert(customerActions)
    .values({
      type: 'self_survey',
      customerId,
      projectId: task.projectId,
      taskId: task.id,
      title: `Self site survey — ${home}`,
      payload: { ...EMPTY_SURVEY, target: surveyTarget(task.id), offerPaise: paise },
    })
    .returning();
  if (!row) return null;
  await logAction(
    tx,
    { projectId: task.projectId, leadId: null },
    {
      kind: 'customer_action',
      message: 'The customer started a self site survey from Home',
      userId: null,
      data: { customerActionId: row.id },
    },
  );
  await recordAudit(tx, null, 'customer_action.created', 'customer_action', row.id, {
    type: 'self_survey',
  });
  return row;
}

/**
 * "Book a visit instead" (or the engineer's choice): the survey ask is cancelled with no discount and the
 * log says so. Returns the survey task, so the visit pick can start on it; null when nothing was open.
 */
export async function cancelForVisit(
  tx: DatabaseExecutor,
  ask: SurveyAction,
  who: { readonly userId: string | null; readonly by: 'customer' | 'team' },
): Promise<JourneyTask | null> {
  const [cancelled] = await tx
    .update(customerActions)
    .set({ status: 'cancelled', cancelledAt: new Date(), updatedAt: new Date() })
    .where(and(eq(customerActions.id, ask.id), eq(customerActions.status, ask.status)))
    .returning();
  if (!cancelled) return null;
  await logAction(
    tx,
    { projectId: ask.projectId, leadId: null },
    {
      kind: 'customer_action',
      message: `Self survey replaced by a visit (${who.by === 'customer' ? 'the customer chose' : 'the team chose'} a visit, no discount)`,
      userId: who.userId,
      data: { customerActionId: ask.id },
    },
  );
  await recordAudit(
    tx,
    who.userId,
    'customer_action.self_survey_visit',
    'customer_action',
    ask.id,
    { by: who.by },
  );
  return ask.taskId ? await taskFor(tx, ask.taskId) : null;
}

/** The customer's open survey the chat waits on: for a photo, or for the consumer number. */
export async function awaitingSurvey(
  db: DatabaseExecutor,
  customerId: string,
  photo: boolean,
): Promise<SurveyAction | null> {
  const [ask] = await db
    .select()
    .from(customerActions)
    .where(
      and(
        eq(customerActions.customerId, customerId),
        eq(customerActions.type, 'self_survey'),
        eq(customerActions.status, 'open'),
        photo
          ? sql`${customerActions.payload}->>'awaiting' in ('corner_a','corner_b','meter','board')`
          : sql`${customerActions.payload}->>'awaiting' = 'consumer'`,
      ),
    )
    .orderBy(desc(customerActions.updatedAt))
    .limit(1);
  return ask ?? null;
}

export const refusalWords = (why: 'too_large' | 'wrong_type' | 'empty' | 'changed' | 'failed') =>
  ({
    too_large: MEDIA_WORDS.tooLarge,
    wrong_type: MEDIA_WORDS.wrongType,
    empty: MEDIA_WORDS.emptyFile,
    changed: MEDIA_WORDS.failed,
    failed: MEDIA_WORDS.failed,
  })[why];
