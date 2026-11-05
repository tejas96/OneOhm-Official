import type { SendOffer, SendRequest } from '@oneohm/api-contracts';
import { homeNameOf, readBusinessSetting } from '@oneohm/database';
import { offerPaise } from '@oneohm/domain';
import { conflict, invalid } from '../../common/http/errors';
import { taskFor } from '../journey/journey-store';
import type { Composed } from '../send-to-customer/send-compose';
import type { SendContext } from '../send-to-customer/send-context';
import type { Deps } from '../send-to-customer/send-papers';
import { openVisitForTask } from '../visits/visit-reads';
import { offerBuilt } from './survey-messages';
import { EMPTY_SURVEY, liveSurveyOf, surveyTarget, surveyTaskOf } from './survey-record';

type Make = (
  key: string,
  label: string,
  detail: string,
  request: SendRequest,
) => Promise<SendOffer>;

/**
 * The offer from the survey task (redesign §7, §18 3): only for a project's survey step the customer is
 * messaged about, while no visit is booked, and only while the offer is switched on in Settings. The
 * credit shown is the one in Settings now and stays that amount for this survey.
 */
export async function surveyOfferCompose(
  deps: Deps,
  ctx: SendContext,
  request: Extract<SendRequest, { action: 'self_survey' }>,
  id: string,
): Promise<Composed> {
  const task = await taskFor(deps.db, request.taskId);
  const survey = task && (await surveyTaskOf(deps.db, task.projectId));
  if (!task || survey?.id !== task.id || task.projectId !== ctx.projectId)
    throw invalid('Choose the survey step of this project.');
  if (!task.notifyCustomer)
    throw invalid('This step is not set to message customers (Settings → Task templates).');
  if (task.status === 'completed') throw conflict('The survey is already done.', 'survey_done');
  const setting = await readBusinessSetting(deps.db, 'reminders');
  const paise = offerPaise(setting);
  if (paise <= 0) throw conflict('The self survey offer is switched off in Settings.', 'offer_off');
  if (await openVisitForTask(deps.db, task.id))
    throw conflict('A visit is already booked for this survey.', 'visit_booked');
  const home = await homeNameOf(deps.db, task.projectId);
  return {
    built: offerBuilt(ctx.customerName, home, paise, id),
    record: {
      kind: 'action',
      id,
      type: 'self_survey',
      taskId: task.id,
      title: `Self site survey — ${home}`,
      propertyId: null,
      projectId: task.projectId,
      payload: { ...EMPTY_SURVEY, target: surveyTarget(task.id), offerPaise: paise },
      log: 'Offered the customer a self site survey (WhatsApp)',
    },
  };
}

/** The sheet's offer for this place: one, when the survey can be offered (nothing otherwise). */
export async function surveyOffers(deps: Deps, ctx: SendContext, make: Make): Promise<SendOffer[]> {
  const task = ctx.taskId
    ? await taskFor(deps.db, ctx.taskId)
    : ctx.projectId
      ? await surveyTaskOf(deps.db, ctx.projectId)
      : null;
  if (!task || (await liveSurveyOf(deps.db, task.id))) return [];
  const offer = await make(
    `survey:${task.id}`,
    'Offer a self site survey with a discount',
    'The customer answers a few questions and sends 4 photos; you check them here.',
    { action: 'self_survey', taskId: task.id },
  ).catch(() => null);
  return offer ? [offer] : [];
}
