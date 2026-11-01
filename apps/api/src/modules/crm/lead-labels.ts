import type { LeadStage } from '@oneohm/domain';

/** Lead stages as people read them in history notes. */
export const STAGE_LABEL: Readonly<Record<LeadStage, string>> = {
  new: 'New',
  contacted: 'Contacted',
  survey_scheduled: 'Survey scheduled',
  quoted: 'Quoted',
  won: 'Won',
  lost: 'Lost',
};
