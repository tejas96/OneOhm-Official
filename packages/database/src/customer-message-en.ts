import { homeEn } from '@oneohm/shared';
import { JOURNEY_EN } from './customer-message-words';

type Payload = Readonly<Record<string, string>>;
type Words = (payload: Payload) => { readonly title: string; readonly body: string };

/**
 * What a customer sees in the app for each WhatsApp message (PRD 5.1, 6.2). Only the
 * customer-facing messages are here; staff digests have no entry and stay WhatsApp only.
 */
export const NOTICE_WORDS: Readonly<Record<string, Words>> = {
  quotation_sent: (p) => ({
    title: 'Your quotation is ready',
    body: `${p.number}: ${p.total}. After subsidy you pay ${p.effective}.`,
  }),
  project_started: (p) => ({
    title: 'Your solar project has started',
    body: `${p.project}: a ${p.capacity} system.`,
  }),
  project_milestone: (p) => ({ title: p.milestone ?? 'Project update', body: p.project ?? '' }),
  project_manager_changed: (p) => ({
    title: 'Your new project manager',
    body: `${p.project}: ${p.manager} now looks after your project. Phone: ${p.phone}.`,
  }),
  payment_received: (p) => ({
    title: 'Payment received',
    body: `${p.amount} for ${p.milestone}. Thank you.`,
  }),
  payment_link: (p) => ({
    title: 'Pay online',
    body: `${p.amount} for ${p.milestone} on ${p.project}. Open Payments to pay by UPI or card.`,
  }),
  payment_reminder: (p) => ({
    title: 'Payment due',
    body: `${p.amount} for ${p.milestone} on ${p.project}.`,
  }),
  service_update: (p) => ({ title: 'Service request update', body: `${p.topic}: ${p.status}.` }),
  contact_changed: (p) => ({
    title: 'Your OneOhm contact has changed',
    body: `${p.staff} is now your contact for ${p.subject}. Call ${p.phone}.`,
  }),
  change_request_raised: (p) => ({
    title: 'Change request started',
    body: `${p.request}, number ${p.number}.`,
  }),
  change_request_completed: (p) => ({
    title: 'Change request done',
    body: `${p.request}, number ${p.number}.`,
  }),
  document_requested: (p) => ({
    title: `Please send your ${p.document}`,
    // With no project (a person's paper) the plain words alone, never "undefined:".
    body: p.project
      ? `${p.project}: open Documents and tap Send to add a photo or PDF.`
      : 'Open Documents and tap Send to add a photo or PDF.',
  }),
  // The request naming the home (papers per home); app inbox and SMS say the same.
  paper_request: (p) => ({
    title: `Please send your ${p.document}`,
    body: `For your solar at ${p.home}. Send it from the OneOhm app, or give it to our team.`,
  }),
  // The team asks again, with the reason (papers: redesign §2); the same words for both requests.
  paper_again: (p) => ({
    title: `Please send your ${p.document} again`,
    body: p.reason ?? '',
  }),
  // The team looked at the paper and it is fine.
  paper_checked: (p) => ({
    title: `Your ${p.document} is checked ✅`,
    body: 'Thank you.',
  }),
  // The paper we hold is too old (redesign 5.4): the same words in the app and in an open chat.
  paper_stale: (p) => ({
    title: `We need your latest ${p.document?.toLowerCase()} for ${p.home}`,
    body: `The one we have is from ${p.month}.`,
  }),
  document_request_cancelled: (p) => ({
    title: `${p.document} is no longer needed`,
    body: 'You do not need to send it.',
  }),
  // The team cancelled something other than a paper (a location, a payment proof, a call time).
  action_cancelled: (p) => ({
    title: `${p.what} is no longer needed`,
    // A cancelled payment proof says the payment is still due (the sender fills `note`).
    body: p.note ?? 'You do not need to do anything.',
  }),
  document_received_by_team: (p) => ({
    title: `We have your ${p.document}`,
    body: `For your solar at ${p.home}. Thank you.`,
  }),
  maintenance_visit: (p) => ({
    title: `Your free ${p.visit} visit is on ${p.date}`,
    body: `${p.project}: our service team will call before they come.`,
  }),
  survey_scheduled: (p) => ({
    title: `Site survey on ${p.date}`,
    body: `${p.project}: our team will call before they come.`,
  }),
  stage_rating_request: (p) => ({
    title: 'How did we do?',
    body: `${p.project}: the ${p.stage} is done. Please rate it in the app.`,
  }),
  installation_started: (p) => ({
    title: 'Installation has started',
    body: `${p.project}: our crew is fitting your ${p.capacity} system.`,
  }),
  commissioning_completed: (p) => ({
    title: 'Your system is switched on',
    body: `${p.project}: the final payment is now due. Open Payments to see it.`,
  }),
  project_update_link: (p) => ({
    title: p.milestone ?? 'Project update',
    body: `${p.project}: the paper is in Documents.`,
  }),
  service_visit_booked: (p) => ({
    title: `Technician visit on ${p.date}`,
    body: `${p.topic}: our technician will call before they come.`,
  }),
  project_waiting: (p) => ({
    title: `Waiting for ${p.reason}`,
    body: `${p.project}: ${p.milestone}. We will keep you posted.`,
  }),
  // Sent from the team's "Send to customer" menu (redesign §18); app inbox and SMS say the same.
  location_request: (p) => ({
    title: `Please share the location of your ${homeEn(p.home)}`,
    body: 'Open our WhatsApp chat and tap Send location, so our team finds it easily.',
  }),
  payment_due: (p) => ({
    title: `${p.amount} is due`,
    body: `For your ${homeEn(p.home)}. Open Payments to pay, or tell us if you paid another way.`,
  }),
  callback_request: (p) => ({
    title: `When should ${p.staff} call you?`,
    body: 'Reply in our WhatsApp chat: morning, afternoon or evening.',
  }),
  delay_notice: (p) => ({
    title: `Your ${p.stage} is waiting`,
    body: `${p.reason}. We will update you.`,
  }),
  crew_contact: (p) => ({
    title: `${p.staff} will come for your ${p.work}`,
    body: `You can call them on ${p.phone}.`,
  }),
  document_share: (p) => ({
    title: `Your ${p.document}`,
    body: 'We sent it on WhatsApp. It is also in Documents.',
  }),
  visit_pick: (p) => ({
    title: `Pick a day for the ${p.work}`,
    body: `When can our team visit ${p.home}? Open our WhatsApp chat and tap Pick a day.`,
  }),
  visit_booked: (p) => ({
    title: `Visit booked: ${p.when}`,
    body: `${p.staff} will call before coming.`,
  }),
  visit_reminder: (p) => ({
    title: `Our team visits ${p.home} ${p.when}`,
    body: `For the ${p.work}. Please confirm in our WhatsApp chat.`,
  }),
  inspection_presence: (p) => ({
    title: `${p.work} on ${p.day}`,
    body: `The electricity board (DISCOM) visits ${p.home}. Please be at home.`,
  }),
  visit_cancelled: (p) => ({ title: 'Visit cancelled', body: p.body ?? '' }),
  visit_crew_changed: (p) => ({ title: 'Who is coming', body: p.body ?? '' }),
  ...JOURNEY_EN,
  referral_reward: (p) => ({
    title: 'Referral reward update',
    body: `${p.friend}: ${p.amount} is ${p.status}.`,
  }),
};
