import { customerLanguage, DEFAULT_MILESTONES, DEFAULT_SERVICE_CATEGORIES } from '@oneohm/domain';
import { eq } from 'drizzle-orm';
import type { DatabaseExecutor } from './client';
import { HINDI_WORDS } from './customer-message-hi';
import { MARATHI_WORDS } from './customer-message-mr';
import { instalmentWords } from './customer-message-names';
import { customers } from './schema/crm.schema';

type Payload = Readonly<Record<string, string>>;
export type LocalWords = (payload: Payload) => { readonly title: string; readonly body: string };

/** The customer messages with in-app words (the same keys as the English table). */
export const IN_APP_MESSAGES = [
  'quotation_sent',
  'project_started',
  'project_milestone',
  'project_manager_changed',
  'payment_received',
  'payment_link',
  'payment_reminder',
  'service_update',
  'contact_changed',
  'change_request_raised',
  'change_request_completed',
  'document_requested',
  'paper_request',
  'paper_again',
  'paper_checked',
  'paper_stale',
  'document_request_cancelled',
  'action_cancelled',
  'document_received_by_team',
  'maintenance_visit',
  'survey_scheduled',
  'referral_reward',
  'stage_rating_request',
  'installation_started',
  'commissioning_completed',
  'project_update_link',
  'service_visit_booked',
  'project_waiting',
  'location_request',
  'payment_due',
  'callback_request',
  'delay_notice',
  'crew_contact',
  'document_share',
  'visit_pick',
  'visit_booked',
  'visit_reminder',
  'inspection_presence',
  'visit_cancelled',
] as const;
type InAppMessage = (typeof IN_APP_MESSAGES)[number];

/** A paper's home when its request has no project; said in the customer's language. */
export const SOME_HOME = 'your home';

/** contact_changed says what the new contact looks after as one of these, never in English. */
export type ContactSubject = 'project' | 'service' | 'enquiry';

/** Project steps by task key, as the customer app names them. */
export const STEP_KEYS = [
  'site_survey',
  'site_survey_society',
  'site_survey_commercial',
  'site_survey_ground',
  'name_change',
  'system_design',
  'loan_approval',
  'discom_application',
  'dispatch_material',
  'structure_installation',
  'installation_complete',
  'testing_commissioning',
  'discom_inspection',
  'net_meter_installation',
  'handover',
  'subsidy_application',
  'subsidy_inspection',
  'subsidy_release',
] as const;

const PAYMENT_STEPS = ['advance', 'before_dispatch', 'final', 'bank_disbursement'] as const;
const CATEGORIES = [
  'no_generation',
  'low_generation',
  'inverter_error',
  'physical_damage',
  'cleaning',
  'billing_net_meter',
  'subsidy',
  'other',
  'maintenance_visit',
] as const;

/**
 * One language's alert words: each message, plus the names that go inside them (OneOhm's
 * own names only; anything the team typed, like a document title, stays as typed).
 */
export interface LanguageWords {
  readonly messages: Readonly<Record<InAppMessage, LocalWords>>;
  readonly steps: Readonly<Record<(typeof STEP_KEYS)[number], string>>;
  readonly payments: Readonly<Record<(typeof PAYMENT_STEPS)[number], string>>;
  readonly categories: Readonly<Record<(typeof CATEGORIES)[number], string>>;
  readonly service: Readonly<Record<'open' | 'in_progress' | 'resolved', string>>;
  readonly reward: Readonly<Record<'pending' | 'approved' | 'paid' | 'rejected', string>>;
  /** What a new contact looks after (contact_changed), by the payload's `subjectKind`. */
  readonly contactSubjects: Readonly<Record<ContactSubject, string>>;
  /** SOME_HOME in the language. */
  readonly someHome: string;
  /** Titles of alerts written straight into the app, with no WhatsApp message behind them. */
  readonly alerts: Readonly<Record<'stage_rating_reply', string>>;
}

const TABLES = { 'mr-IN': MARATHI_WORDS, 'hi-IN': HINDI_WORDS } as const;

const has = <T extends object>(
  table: T,
  key: string | undefined,
): key is Extract<keyof T, string> => key !== undefined && Object.hasOwn(table, key);

/** English names the server puts in payloads, back to their keys. */
const PAYMENT_BY_LABEL = new Map<string, string>([
  ...DEFAULT_MILESTONES.map((step) => [step.label.toLowerCase(), step.key] as const),
  ['bank loan disbursement', 'bank_disbursement'],
]);
const CATEGORY_BY_LABEL = new Map<string, string>(
  DEFAULT_SERVICE_CATEGORIES.flatMap((category) => [
    [category.customerLabel.toLowerCase(), category.key] as const,
    [category.label.toLowerCase(), category.key] as const,
  ]),
);
const SERVICE_BY_WORDS: Readonly<Record<string, 'open' | 'in_progress' | 'resolved'>> = {
  received: 'open',
  'being worked on': 'in_progress',
  resolved: 'resolved',
};

function rewardWords(status: string | undefined, words: LanguageWords): string | undefined {
  if (!status) return undefined;
  if (status.startsWith('not approved')) {
    const reason = /\((.+)\)$/.exec(status)?.[1];
    return reason && reason !== 'see app'
      ? `${words.reward.rejected} (${reason})`
      : words.reward.rejected;
  }
  if (status.startsWith('earned')) return words.reward.pending;
  if (status.startsWith('approved')) return words.reward.approved;
  if (status.startsWith('paid')) return words.reward.paid;
  return undefined;
}

function statusWords(template: string, status: string | undefined, words: LanguageWords) {
  if (template === 'referral_reward') return rewardWords(status, words);
  const service = SERVICE_BY_WORDS[status ?? ''];
  return template === 'service_update' && service ? words.service[service] : undefined;
}

/** contact_changed's subject in the language: a project also names its town and size. */
function contactSubject(template: string, p: Payload, words: LanguageWords) {
  if (template !== 'contact_changed' || !has(words.contactSubjects, p.subjectKind)) return;
  const said = words.contactSubjects[p.subjectKind];
  return p.subjectKind === 'project' && p.projectWords ? `${said} (${p.projectWords})` : said;
}

/** The payload with OneOhm's own English names said in the customer's language. */
function localPayload(
  template: string,
  p: Payload,
  words: LanguageWords,
  language: 'mr-IN' | 'hi-IN',
): Payload {
  const paymentKey = PAYMENT_BY_LABEL.get(p.milestone?.toLowerCase() ?? '');
  const categoryKey = CATEGORY_BY_LABEL.get(p.topic?.toLowerCase() ?? '');
  const milestone =
    instalmentWords(language, p.instalment) ??
    (has(words.steps, p.step) ? words.steps[p.step] : undefined) ??
    (has(words.payments, paymentKey) ? words.payments[paymentKey] : undefined);
  const topic = has(words.categories, categoryKey) ? words.categories[categoryKey] : undefined;
  const status = statusWords(template, p.status, words);
  const subject = contactSubject(template, p, words);
  return {
    ...p,
    ...(p.home === SOME_HOME ? { home: words.someHome } : {}),
    ...(subject ? { subject } : {}),
    ...(milestone ? { milestone } : {}),
    ...(topic ? { topic } : {}),
    ...(status ? { status } : {}),
  };
}

/** Marathi or Hindi words for one in-app alert; undefined for English or an unknown message. */
export function localWords(language: string | undefined, template: string): LocalWords | undefined {
  const code = customerLanguage(language);
  if (code === 'en-IN') return undefined;
  const words = TABLES[code];
  if (!has(words.messages, template)) return undefined;
  const say = words.messages[template];
  return (payload) => say(localPayload(template, payload, words, code));
}

/**
 * A message's values with OneOhm's own names (steps, payment purposes, service topics) in
 * the customer's language, for a WhatsApp template approved in Marathi or Hindi.
 */
export function localValues(language: string | undefined, template: string, payload: Payload) {
  const code = customerLanguage(language);
  return code === 'en-IN' ? payload : localPayload(template, payload, TABLES[code], code);
}

/** The title of an app-only alert in the customer's language; undefined for English. */
export function localAlertTitle(
  kind: keyof LanguageWords['alerts'],
  language: string | undefined,
): string | undefined {
  const code = customerLanguage(language);
  return code === 'en-IN' ? undefined : TABLES[code].alerts[kind];
}

/** The customer's language by mobile number (for the worker's later WhatsApp templates). */
export async function languageOf(db: DatabaseExecutor, phoneE164: string): Promise<string> {
  const [row] = await db
    .select({ language: customers.preferredLanguage })
    .from(customers)
    .where(eq(customers.phoneE164, phoneE164))
    .limit(1);
  return customerLanguage(row?.language);
}
