/**
 * How an ask done in person is closed by the team (customer not on WhatsApp). A plain close fits asks with
 * nothing to record; the roof and installation questions take the Yes / Not yet answer (the same handler as
 * the customer's tap); the rest need their own step first, and `hint` says which.
 */
export type InPersonClose =
  | { readonly how: 'plain' }
  | { readonly how: 'confirm'; readonly kind: 'site_ready' | 'installation' }
  | { readonly how: 'hint'; readonly hint: string };

const PLAIN: readonly string[] = ['location', 'callback', 'presence', 'rating', 'paper'];

const HINTS: Readonly<Record<string, string>> = {
  pay: 'Record the payment on the instalment instead.',
  visit_pick: 'Book the visit with a day and slot instead.',
  signature: 'Upload the signed copy instead.',
  payout: 'Save and check the UPI ID on the reward instead.',
  self_survey: 'Review the survey instead.',
};

export function inPersonClose(type: string, kind: string | null): InPersonClose {
  if (PLAIN.includes(type)) return { how: 'plain' };
  if (type === 'confirm' && (kind === 'site_ready' || kind === 'installation'))
    return { how: 'confirm', kind };
  return { how: 'hint', hint: HINTS[type] ?? 'Record the answer on the project step instead.' };
}
