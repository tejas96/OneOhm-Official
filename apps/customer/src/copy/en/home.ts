import type { EpcStage } from '@oneohm/domain';
import { CHAT_OPENERS } from '@oneohm/domain';

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
  site_survey_society: 'Site visit and roof measurements',
  site_survey_commercial: 'Site visit and roof measurements',
  site_survey_ground: 'Site visit and land measurements',
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
  subsidy_inspection: 'Subsidy inspection approved',
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
    'Once you accept your quotation and your project starts, you can follow every step here.',
  system: (kwp: string, place: string) => `${kwp} solar · ${place}`,
  journeyTitle: 'Your solar journey',
  stageCount: (done: number, total: number) => `${done} of ${total} steps done`,
  live: 'Your system is live',
  liveBody: (company: string) =>
    `It is making electricity for your home. Thank you for choosing ${company}.`,
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
    customer: 'Your contact needs something from you. Please give them a call.',
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
    inspected: 'Inspection approved. The government releases it to your bank next.',
    released: 'Released to your bank account.',
    not_applicable: 'Not applicable to this project.',
  },
  /** What the customer told us about a released subsidy (the same as the WhatsApp Project update). */
  subsidyNote: {
    received: 'Reached your bank account ✅',
    checking: 'You told us it has not arrived. We are checking with the government.',
  },
  subsidyNoteStatus: { received: 'Received', checking: 'Checking' },
  subsidyStatus: {
    pending: 'Not applied yet',
    applied: 'Applied',
    inspected: 'Inspected',
    released: 'Released',
  },
  contactTitle: 'Your contact',
  contactFallback: (company: string) => `${company} team`,
  call: 'Call',
  whatsapp: 'WhatsApp',
  /** Sent to the business number; the assistant hands it to the contact person. */
  talkToPerson: CHAT_OPENERS.talkToPerson.en,
  referTitle: 'Know someone who wants solar?',
  referBody: 'Refer a neighbour or friend. We call them and keep you posted.',
  referAction: 'Refer someone',
  feedbackTitle: 'How did we do?',
  feedbackBody: 'Your rating helps our team do better for the next home.',
  feedbackAction: 'Rate your experience',
  feedbackThanks: 'Thank you for your rating.',
  /** The to-do card: what the customer needs to do (PRD 5.1). */
  todoTitle: 'For you to do',
  todoPay: 'Pay',
  todoSee: 'See',
  todoSend: 'Send',
  todoRate: 'Rate',
  todoPaymentMeta: (amount: string) => `${amount} due`,
  todoPaperMeta: 'A paper we need from you',
  todoRatingMeta: 'It takes a few seconds.',
  todoFeedback: 'How was your solar experience?',
  todoPayFailed: 'The payment page could not open. Please try again.',
} as const;
