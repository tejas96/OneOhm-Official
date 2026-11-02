import type { SERVICE_CATEGORIES } from '@oneohm/api-contracts';

type Category = (typeof SERVICE_CATEGORIES)[number];

const RULES: readonly [RegExp, Category, string][] = [
  [/inverter|error|fault|beep|इन्व्हर्टर|इन्वर्टर|एरर/i, 'inverter_error', 'inverter'],
  [
    /no (power|generation)|not generating|zero|stopped|बंद|वीज नाही|बिजली नहीं/i,
    'no_generation',
    'no generation',
  ],
  [/low|less|reduced|कमी|कम /i, 'low_generation', 'low generation'],
  [/broken|damage|crack|leak|wire|तुटल|टूट|नुकसान|गळ|वायर/i, 'physical_damage', 'damage'],
  [/clean|dust|wash|स्वच्छ|सफ़ाई|सफाई|धूळ|धूल/i, 'cleaning', 'cleaning'],
  [/bill|net ?meter|meter|बिल|मीटर/i, 'billing_net_meter', 'bill or meter'],
  [/subsidy|अनुदान|सब्सिडी/i, 'subsidy', 'subsidy'],
];

/** A best guess at the kind of problem from the customer's words; the team can change it. */
export function guessCategory(text: string): { category: Category; label: string } {
  const hit = RULES.find(([pattern]) => pattern.test(text));
  return hit ? { category: hit[1], label: hit[2] } : { category: 'other', label: 'service' };
}

/** A name and a 10-digit Indian mobile from one message, or null. */
export function readReferral(text: string): { name: string; phone: string } | null {
  const match = text.match(/(?:\+?91[\s-]?)?([6-9](?:[\s-]?\d){9})(?!\d)/);
  if (!match?.[1]) return null;
  const name = text
    .replace(match[0], ' ')
    .replace(/[^\p{L}\s.'-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return name.length >= 2 ? { name, phone: `+91${match[1].replace(/\D/g, '')}` } : null;
}
