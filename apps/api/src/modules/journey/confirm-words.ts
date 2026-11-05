import { JOURNEY_WORDS } from './journey-words';
import { STEP_WORDS } from './step-words';

/** What a cancelled question of one kind is called, and what the customer is told (one place for every `confirm` kind). */
export function confirmWords(kind: string): { what: string; cancelled: string } {
  const step = STEP_WORDS;
  switch (kind) {
    case 'installation':
      return { what: JOURNEY_WORDS.install.what, cancelled: JOURNEY_WORDS.install.cancelled };
    case 'subsidy_register':
      return { what: step.register.what, cancelled: step.register.cancelled };
    case 'subsidy_credit':
      return { what: step.credit.what, cancelled: step.credit.cancelled };
    case 'bank_sign':
      return { what: step.bank.what, cancelled: step.bank.cancelled };
    case 'layout':
      return { what: step.layout.what, cancelled: step.layout.cancelled };
    default:
      return { what: JOURNEY_WORDS.ready.what, cancelled: JOURNEY_WORDS.ready.cancelled };
  }
}

/** The friendly noun of a question in "We need … to continue." */
export function confirmNoun(kind: string): string {
  const nouns = { ...JOURNEY_WORDS.nouns, ...STEP_WORDS.nouns };
  const key = (
    {
      installation: 'install',
      subsidy_register: 'register',
      subsidy_credit: 'credit',
      bank_sign: 'bank',
      layout: 'layout',
    } as Record<string, keyof typeof nouns>
  )[kind];
  const noun = key ? nouns[key] : nouns.roof;
  return typeof noun === 'string' ? noun : nouns.roof;
}
