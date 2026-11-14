import type { LeadDetail, Visit } from '@oneohm/api-contracts';

const OPEN_VISIT = new Set<Visit['status']>(['proposed', 'confirmed']);

/** True when the lead already has a survey visit that is waiting (to confirm or confirmed). */
export const hasOpenSurvey = (visits: readonly Pick<Visit, 'status'>[]): boolean =>
  visits.some((visit) => OPEN_VISIT.has(visit.status));

/**
 * Moving a lead to a step of the "Survey booked" stage asks for a day and time, unless the lead
 * is already in that stage (only the step changes) or already has a survey visit waiting.
 * `visits` is `undefined` while they are not known, which asks.
 */
export function needsSurveyBooking(
  lead: Pick<LeadDetail, 'stage'>,
  targetStage: string,
  visits: readonly Pick<Visit, 'status'>[] | undefined,
): boolean {
  if (targetStage !== 'survey_scheduled' || lead.stage === 'survey_scheduled') return false;
  return !(visits && hasOpenSurvey(visits));
}
