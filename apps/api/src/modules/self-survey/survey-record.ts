import {
  customerActions,
  type DatabaseExecutor,
  milestoneCredits,
  projects,
  projectTasks,
  properties,
} from '@oneohm/database';
import {
  SELF_SURVEY_TASK_KEY,
  SURVEY_FACT_KEYS,
  type SurveyAnswers,
  type SurveyItem,
  type SurveyPhoto,
} from '@oneohm/domain';
import { and, arrayOverlaps, asc, desc, eq, inArray, ne } from 'drizzle-orm';

export type SurveyAction = typeof customerActions.$inferSelect;

/** What a self-survey ask keeps in its payload (redesign §7). Amounts are paise, fixed when offered. */
export interface SurveyPayload {
  readonly target: string;
  readonly offerPaise: number;
  readonly answers: SurveyAnswers;
  /** Photo item -> document id (the customer's file, filed on the home once the survey is sent). */
  readonly photos: Partial<Record<SurveyPhoto, string>>;
  /** Items the engineer asked again, still missing. */
  readonly askAgain: readonly SurveyItem[];
  /** The chat is waiting for this item (a photo or typed words). */
  readonly awaiting: SurveyItem | null;
  readonly startedAt: string | null;
  /** The engineer last asked for items again: the 7 days and the reminder count from here (or the start). */
  readonly askedAgainAt: string | null;
  /** Wrong consumer numbers typed in a row: one re-prompt, then the words are treated as ordinary chat. */
  readonly badTries: number;
  readonly sentAt: string | null;
  /** The credit this approval gave (milestone_credits id). */
  readonly creditId: string | null;
}

export const EMPTY_SURVEY: Omit<SurveyPayload, 'target' | 'offerPaise'> = {
  answers: {},
  photos: {},
  askAgain: [],
  awaiting: null,
  startedAt: null,
  askedAgainAt: null,
  badTries: 0,
  sentAt: null,
  creditId: null,
};

export const surveyTarget = (taskId: string) => `self_survey:${taskId}`;

/** The payload with every field present (older or fresh rows may lack some). */
export function payloadOf(action: Pick<SurveyAction, 'payload'>): SurveyPayload {
  const raw = action.payload as Partial<SurveyPayload>;
  return {
    ...EMPTY_SURVEY,
    ...raw,
    target: String(raw.target ?? ''),
    offerPaise: Number(raw.offerPaise ?? 0),
  };
}

/** The project's survey task: the one that records the survey facts. */
export async function surveyTaskOf(db: DatabaseExecutor, projectId: string) {
  const [task] = await db
    .select()
    .from(projectTasks)
    .where(
      and(
        eq(projectTasks.projectId, projectId),
        arrayOverlaps(projectTasks.captures, [...SURVEY_FACT_KEYS]),
      ),
    )
    .orderBy(asc(projectTasks.position))
    .limit(1);
  return task ?? null;
}

/** The survey ask of this task that still lives (open, or sent and waiting for the check), newest first. */
export async function liveSurveyOf(db: DatabaseExecutor, taskId: string) {
  const [action] = await db
    .select()
    .from(customerActions)
    .where(
      and(
        eq(customerActions.type, 'self_survey'),
        eq(customerActions.taskId, taskId),
        inArray(customerActions.status, ['open', 'received']),
      ),
    )
    .orderBy(desc(customerActions.createdAt))
    .limit(1);
  return action ?? null;
}

/** The newest survey ask of this task, whatever its state (a closed one carries the credit). */
export async function lastSurveyOf(db: DatabaseExecutor, taskId: string) {
  const [action] = await db
    .select()
    .from(customerActions)
    .where(and(eq(customerActions.type, 'self_survey'), eq(customerActions.taskId, taskId)))
    .orderBy(desc(customerActions.createdAt))
    .limit(1);
  return action ?? null;
}

/** One ask of this customer by id and state. */
export async function surveyById(
  db: DatabaseExecutor,
  customerId: string,
  id: string,
  status: SurveyAction['status'][] = ['open'],
) {
  const [action] = await db
    .select()
    .from(customerActions)
    .where(
      and(
        eq(customerActions.id, id),
        eq(customerActions.customerId, customerId),
        eq(customerActions.type, 'self_survey'),
        inArray(customerActions.status, status),
      ),
    );
  return action ?? null;
}

/** Changes the payload of a survey ask under a row lock; the new payload is returned. */
export async function updateSurvey(
  tx: DatabaseExecutor,
  id: string,
  change: (current: SurveyPayload) => Partial<SurveyPayload>,
): Promise<SurveyPayload> {
  const [row] = await tx
    .select()
    .from(customerActions)
    .where(eq(customerActions.id, id))
    .for('update');
  if (!row) throw new Error('Survey not found');
  const next = { ...payloadOf(row), ...change(payloadOf(row)) };
  await tx
    .update(customerActions)
    .set({ payload: { ...row.payload, ...next }, updatedAt: new Date() })
    .where(eq(customerActions.id, id));
  return next;
}

/** The home of a project and whether it already has a consumer number. */
export async function homeOfProject(db: DatabaseExecutor, projectId: string) {
  const [row] = await db
    .select({
      propertyId: properties.id,
      consumerNumber: properties.consumerNumber,
      customerId: projects.customerId,
    })
    .from(projects)
    .innerJoin(properties, eq(properties.id, projects.propertyId))
    .where(eq(projects.id, projectId));
  return row ?? null;
}

/**
 * Why this survey step cannot be offered a self survey now, or null: only the residential rooftop survey takes
 * one, not while it waits for review or is done, and a project earns the discount once (a closed survey or a
 * live credit ends the offer).
 */
export async function offerBlocker(
  db: DatabaseExecutor,
  task: Pick<typeof projectTasks.$inferSelect, 'id' | 'projectId' | 'templateKey' | 'status'>,
): Promise<string | null> {
  if (task.templateKey !== SELF_SURVEY_TASK_KEY)
    return 'The self survey is for the residential rooftop survey only.';
  if (task.status === 'completed') return 'The survey is already done.';
  if (task.status === 'in_review') return 'The survey is waiting for its review.';
  const [credit] = await db
    .select({ id: milestoneCredits.id })
    .from(milestoneCredits)
    .where(
      and(
        eq(milestoneCredits.projectId, task.projectId),
        eq(milestoneCredits.source, 'self_survey'),
        ne(milestoneCredits.status, 'reversed'),
      ),
    )
    .limit(1);
  const [closed] = await db
    .select({ id: customerActions.id })
    .from(customerActions)
    .where(
      and(
        eq(customerActions.projectId, task.projectId),
        eq(customerActions.type, 'self_survey'),
        eq(customerActions.status, 'closed'),
      ),
    )
    .limit(1);
  return credit || closed ? 'This project already had its self survey.' : null;
}

/** The project's survey step that takes a self survey. */
export async function selfSurveyTaskOf(db: DatabaseExecutor, projectId: string) {
  const [task] = await db
    .select()
    .from(projectTasks)
    .where(
      and(
        eq(projectTasks.projectId, projectId),
        eq(projectTasks.templateKey, SELF_SURVEY_TASK_KEY),
      ),
    );
  return task ?? null;
}
