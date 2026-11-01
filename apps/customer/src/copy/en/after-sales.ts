import type { CustomerCover, InstalledAsset } from '@oneohm/api-contracts';

/** Warranty, AMC, planned visits and rating a request (PRD 5.5). */
export const COVER = {
  title: 'Warranty and AMC',
  cardTitle: 'Your system’s cover',
  loading: 'Loading your warranty',
  notYet: 'Your warranties start on the day your system is switched on. They will show here.',
  details: 'See warranty details',
  kinds: {
    panel: 'Solar panels',
    inverter: 'Inverter',
    battery: 'Battery',
    structure: 'Mounting structure',
    workmanship: 'Installation work',
  } satisfies Readonly<Record<InstalledAsset['kind'], string>>,
  state: { active: 'Covered', ending_soon: 'Ends soon', ended: 'Ended' } satisfies Readonly<
    Record<InstalledAsset['warrantyState'], string>
  >,
  until: (date: string) => `Covered until ${date}`,
  performance: (date: string) => `Power output guaranteed until ${date}`,
  count: (count: number) => `${count} ×`,
  since: (date: string) => `Switched on ${date}. Cover counts from that day.`,
  amcTitle: 'Annual maintenance (AMC)',
  noAmc: 'No AMC yet. Ask OneOhm about free cleaning and check-up visits every year.',
  amcState: {
    upcoming: 'Starts soon',
    active: 'Active',
    ended: 'Ended',
    cancelled: 'Cancelled',
  } satisfies Readonly<Record<NonNullable<CustomerCover['amc']>['state'], string>>,
  amcPeriod: (from: string, to: string) => `${from} to ${to}`,
  amcVisits: (done: number, total: number) => `${done} of ${total} visits done`,
  includes: 'Each visit includes',
  ask: 'Ask about an AMC',
  askDescription: 'I would like to know about an AMC (annual maintenance) for my system.',
} as const;

export const VISITS = {
  title: 'Upcoming visits',
  on: (date: string) => `On ${date}`,
  visit: (name: string) => `Free ${name} visit`,
  under: (plan: string, code: string) => `${plan} · ${code}`,
  status: {
    planned: 'Planned',
    open: 'Booked',
    in_progress: 'Team on it',
    resolved: 'Done',
  },
} as const;

export const RATE = {
  title: 'How did we do?',
  intro: 'Rate how the service team handled this request.',
  action: 'Rate this',
  change: 'Change rating',
  yours: (rating: number) => `You rated ${rating} of 5`,
  ratingLabel: 'Your rating',
  stars: ['Poor', 'Could be better', 'Good', 'Very good', 'Excellent'] as const,
  pick: 'Choose a rating first.',
  commentLabel: 'Anything to add?',
  commentHint: 'What went well, and what could we do better?',
  submit: 'Send rating',
  sent: 'Thank you for your rating.',
  notFound: 'This request was not found.',
  visit: 'Maintenance visit',
  scheduled: (date: string) => `Visit on ${date}`,
} as const;
