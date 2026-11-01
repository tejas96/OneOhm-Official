/** Copy for family access (PRD 5.1). */
export const FAMILY = {
  cardTitle: 'Family access',
  cardHint: 'Let family members follow the project and pay from their own phone.',
  open: 'Manage family',
  title: 'Family access',
  intro:
    'People you add sign in with their own mobile number and see the same projects, documents and payments. WhatsApp updates still come to your number.',
  viewerIntro: (owner: string) =>
    `You are signed in as a family member of ${owner}. Only ${owner} can add or remove people.`,
  empty: 'Nobody else has access yet.',
  addTitle: 'Add a family member',
  name: 'Name',
  phone: 'Mobile number',
  relation: 'Relation',
  relationHint: 'For example: wife, son, brother.',
  add: 'Add',
  added: (name: string) => `${name} can now sign in.`,
  remove: 'Remove',
  removeLabel: (name: string) => `Remove ${name}`,
  removed: (name: string) => `${name} no longer has access.`,
  failed: 'That did not work. Please try again.',
} as const;
