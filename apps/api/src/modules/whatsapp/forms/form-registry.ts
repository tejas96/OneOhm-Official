import { SEND_PAPER_FLOW, SEND_PAPER_VERSION } from './send-paper.flow';

/** The forms we publish to WhatsApp, by key. The Flow JSON of each lives beside it. */
export const FORM_KEYS = ['send_paper'] as const;
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
];

export const isFormKey = (key: string): key is FormKey =>
  (FORM_KEYS as readonly string[]).includes(key);
