import type { Person } from '@oneohm/api-contracts';

/** Whether a current member still has to accept their invite: they have never signed in. */
export const awaitsSignIn = (person: Person) =>
  person.status === 'active' && person.invite === 'not_signed_in';

/**
 * What the row offers someone who has not signed in yet. While WhatsApp invites are off,
 * only the text to copy (the server refuses a resend then).
 */
export function inviteActions(person: Person): ('sendAgain' | 'copyText')[] {
  if (!awaitsSignIn(person)) return [];
  const copy = person.inviteText ? (['copyText'] as const) : [];
  return person.invitesOn ? ['sendAgain', ...copy] : [...copy];
}
