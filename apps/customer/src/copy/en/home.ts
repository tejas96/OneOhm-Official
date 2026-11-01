import type { EpcStage } from '@oneohm/domain';

/** What each stage means for the homeowner, in one line. */
export const STAGE_MEANING: Readonly<Record<EpcStage, string>> = {
  survey: 'Our engineer visits to measure your roof and check your meter.',
  design: 'We plan where each panel goes and finalise your system.',
  material: 'Panels, inverter and structure are ordered and checked.',
  installation: 'Our crew fits the structure, panels and wiring.',
  commissioning: 'We test everything and switch your system on.',
  net_metering: 'The electricity board inspects and fits your net meter.',
  subsidy: 'We apply for your government subsidy and follow it to your bank.',
};

/**
 * Milestones in the customer's words, by task key. Unknown keys fall back to the
 * title from OneOhm, so new milestones still show.
 */
export const MILESTONE = {
  site_survey: 'Site visit and roof measurements',
  name_change: 'Electricity connection name change',
  system_design: 'Your system design is approved',
  loan_approval: 'Bank loan sanctioned',
  discom_application: 'Net-meter application filed with the electricity board',
  dispatch_material: 'Equipment on its way to your home',
  structure_installation: 'Mounting structure fitted',
  installation_complete: 'Installation finished and checked',
  testing_commissioning: 'System tested and switched on',
  discom_inspection: 'Electricity board inspection',
  net_meter_installation: 'Net meter fitted',
  handover: 'Handover and warranty papers',
  subsidy_application: 'Subsidy applied on the PM Surya Ghar portal',
  subsidy_release: 'Subsidy released to your bank account',
} as const;

export const HOME = {
  greeting: {
    morning: 'Good morning',
    midday: 'Good afternoon',
    evening: 'Good evening',
    night: 'Good evening',
  },
  loading: 'Loading your solar journey',
  noProjectTitle: 'Your project will appear here',
  noProjectBody:
    'Once you accept a OneOhm quotation and your project starts, you can follow every step here.',
  system: (kwp: string, place: string) => `${kwp} solar · ${place}`,
  journeyTitle: 'Your solar journey',
  stageCount: (done: number, total: number) => `${done} of ${total} steps done`,
  live: 'Your system is live',
  liveBody: 'It is making electricity for your home. Thank you for choosing OneOhm.',
  now: 'Now',
  skipped: 'Not needed for your home',
  nextTitle: 'What happens next',
  nextOn: (date: string) => `Planned for ${date}`,
  nothingNext: 'We will share the next step soon.',
  waiting: {
    customer: 'Waiting for you',
    bank: 'Waiting for the bank',
    discom: 'Waiting for the electricity board',
  },
  waitingBody: {
    customer: 'Your OneOhm contact needs something from you. Please give them a call.',
    bank: 'Your loan file is with the bank. We follow up for you.',
    discom: 'The electricity board is reviewing your application. We follow up for you.',
  },
  waitingSince: (date: string) => `Since ${date}`,
  updatesTitle: 'Recent updates',
  noUpdates: 'Updates appear here as each step is completed.',
  switcher: 'Your homes',
  subsidyTitle: 'Government subsidy',
  subsidy: {
    pending: 'We will apply once your net meter is fitted.',
    applied: 'Applied on the PM Surya Ghar portal. The government pays it to your bank.',
    released: 'Released to your bank account.',
    not_applicable: 'Not applicable to this project.',
  },
  subsidyStatus: { pending: 'Not applied yet', applied: 'Applied', released: 'Released' },
  contactTitle: 'Your OneOhm contact',
  contactFallback: 'OneOhm team',
  call: 'Call',
  whatsapp: 'WhatsApp',
  referTitle: 'Know someone who wants solar?',
  referBody: 'Refer a neighbour or friend. We call them and keep you posted.',
  referAction: 'Refer someone',
  feedbackTitle: 'How did we do?',
  feedbackBody: 'Your rating helps our team do better for the next home.',
  feedbackAction: 'Rate your experience',
  feedbackThanks: 'Thank you for your rating.',
} as const;
