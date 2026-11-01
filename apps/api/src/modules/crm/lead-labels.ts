import type { LeadLostReason, LeadSource, LeadStage } from '@oneohm/domain';

/** Lead stages as people read them in history notes. */
export const STAGE_LABEL: Readonly<Record<LeadStage, string>> = {
  new: 'New',
  contacted: 'Contacted',
  survey_scheduled: 'Survey scheduled',
  quoted: 'Quoted',
  won: 'Won',
  lost: 'Lost',
};

/** Where a lead came from, as alerts and notes say it. */
export const SOURCE_LABEL: Readonly<Record<LeadSource, string>> = {
  manual: 'Walk-in or call',
  website: 'Website',
  whatsapp: 'WhatsApp',
  employee: 'Employee',
  reseller: 'Reseller',
  referral: 'Customer referral',
};

/** Lost reasons as the history note says them. */
export const LOST_REASON_LABEL: Readonly<Record<LeadLostReason, string>> = {
  price: 'Price too high',
  competitor: 'Went with another company',
  not_interested: 'Not interested any more',
  no_response: 'Could not reach them',
  not_feasible: 'Site not suitable',
  finance: 'Could not arrange the money',
  postponed: 'Putting it off for now',
  other: 'Other',
};
