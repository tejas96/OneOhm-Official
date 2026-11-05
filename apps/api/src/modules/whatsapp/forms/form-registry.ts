import { PAID_ANOTHER_WAY_FLOW, PAID_ANOTHER_WAY_VERSION } from './paid-another-way.flow';
import { REFER_FRIEND_FLOW, REFER_FRIEND_VERSION } from './refer-friend.flow';
import { REPORT_PROBLEM_FLOW, REPORT_PROBLEM_VERSION } from './report-problem.flow';
import { SELF_SURVEY_FLOW, SELF_SURVEY_VERSION } from './self-survey.flow';
import { SEND_PAPER_FLOW, SEND_PAPER_VERSION } from './send-paper.flow';
import { SHARE_UPI_FLOW, SHARE_UPI_VERSION } from './share-upi.flow';

/** The forms we publish to WhatsApp, by key. The Flow JSON of each lives beside it. */
export const FORM_KEYS = [
  'send_paper',
  'paid_another_way',
  'self_survey',
  'report_problem',
  'refer_friend',
  'share_upi',
] as const;
export type FormKey = (typeof FORM_KEYS)[number];

export interface FormDefinition {
  readonly key: FormKey;
  /** What Settings calls it, and the name the flow gets in WhatsApp Manager. */
  readonly name: string;
  readonly version: string;
  readonly flowJson: object;
  /** Meta's flow categories. */
  readonly categories: readonly string[];
}

export const FORMS: readonly FormDefinition[] = [
  {
    key: 'send_paper',
    name: 'Send a paper',
    version: SEND_PAPER_VERSION,
    flowJson: SEND_PAPER_FLOW,
    categories: ['OTHER'],
  },
  {
    key: 'paid_another_way',
    name: 'I paid another way',
    version: PAID_ANOTHER_WAY_VERSION,
    flowJson: PAID_ANOTHER_WAY_FLOW,
    categories: ['OTHER'],
  },
  {
    key: 'self_survey',
    name: 'Self site survey',
    version: SELF_SURVEY_VERSION,
    flowJson: SELF_SURVEY_FLOW,
    categories: ['OTHER'],
  },
  {
    key: 'report_problem',
    name: 'Report a problem',
    version: REPORT_PROBLEM_VERSION,
    flowJson: REPORT_PROBLEM_FLOW,
    categories: ['CUSTOMER_SUPPORT'],
  },
  {
    key: 'refer_friend',
    name: 'Refer a friend',
    version: REFER_FRIEND_VERSION,
    flowJson: REFER_FRIEND_FLOW,
    categories: ['LEAD_GENERATION'],
  },
  {
    key: 'share_upi',
    name: 'Share your UPI ID',
    version: SHARE_UPI_VERSION,
    flowJson: SHARE_UPI_FLOW,
    categories: ['OTHER'],
  },
];

export const isFormKey = (key: string): key is FormKey =>
  (FORM_KEYS as readonly string[]).includes(key);
