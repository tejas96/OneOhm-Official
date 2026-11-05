import {
  customerActions,
  type DatabaseExecutor,
  projects,
  properties,
  readBusinessSetting,
} from '@oneohm/database';
import { offerPaise, SURVEY_HOME_DAYS } from '@oneohm/domain';
import { and, asc, eq, inArray, ne } from 'drizzle-orm';
import { activeProjectsOf } from '../customer-portal/active-projects';
import { openVisitForTask } from '../visits/visit-reads';
import { payloadOf, surveyTaskOf } from './survey-record';

/** The self survey as Home shows it: the offer, or "finish your survey" once started. */
export interface SurveyAsk {
  readonly kind: 'survey';
  readonly taskId: string;
  /** The ask, when there is one (the team sent it, or the customer started it). */
  readonly requestId: string | null;
  readonly started: boolean;
  readonly paise: number;
  readonly home: string | null;
}

const homeName = (row: { label: string | null; city: string | null }) =>
  row.label?.trim() || row.city || null;

/**
 * The survey still waiting for the customer: an ask of ours that is open (a started one shows for 7 days),
 * or, with none, the offer for a project whose survey step is not done, has no visit booked and may message
 * the customer, while the offer is on in Settings (redesign §7). Never on a lead.
 */
export async function surveyAsks(
  db: DatabaseExecutor,
  customerId: string,
  now = new Date(),
): Promise<SurveyAsk[]> {
  const setting = await readBusinessSetting(db, 'reminders');
  const projectRows = await db
    .select({
      id: projects.id,
      label: properties.label,
      city: properties.city,
    })
    .from(projects)
    .innerJoin(properties, eq(properties.id, projects.propertyId))
    .where(and(activeProjectsOf(customerId), ne(projects.status, 'cancelled')))
    .orderBy(asc(projects.createdAt));
  const found: SurveyAsk[] = [];
  for (const project of projectRows) {
    const task = await surveyTaskOf(db, project.id);
    if (!task || task.status === 'completed' || !task.notifyCustomer) continue;
    if (await openVisitForTask(db, task.id)) continue;
    const [ask] = await db
      .select()
      .from(customerActions)
      .where(
        and(
          eq(customerActions.type, 'self_survey'),
          eq(customerActions.taskId, task.id),
          inArray(customerActions.status, ['open', 'received']),
        ),
      );
    const home = homeName(project);
    if (ask?.status === 'received') continue;
    if (ask) {
      const payload = payloadOf(ask);
      const since = payload.startedAt ? Date.parse(payload.startedAt) : Number.NaN;
      const stale = !Number.isNaN(since) && now.getTime() - since > SURVEY_HOME_DAYS * 86_400_000;
      if (!stale)
        found.push({
          kind: 'survey',
          taskId: task.id,
          requestId: ask.id,
          started: !Number.isNaN(since),
          paise: payload.offerPaise,
          home,
        });
      continue;
    }
    const paise = offerPaise(setting);
    if (paise > 0)
      found.push({ kind: 'survey', taskId: task.id, requestId: null, started: false, paise, home });
  }
  return found;
}
