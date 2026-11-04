import type { NavGroup } from './settings-nav';

/** Every settings section; the value is the `?tab=` in links, so it never changes. */
export const SECTIONS = [
  'company',
  'roles',
  'workforce',
  'rewards',
  'leadSteps',
  'leadAssignment',
  'leadCampaigns',
  'whatsappOnboarding',
  'referrals',
  'products',
  'rates',
  'payments',
  'approvals',
  'projectTypes',
  'tasks',
  'documents',
  'discoms',
  'assignment',
  'messages',
  'reminders',
  'dashboard',
  'serviceSla',
  'warranty',
  'amcPlans',
  'automation',
  'activity',
] as const;
export type Section = (typeof SECTIONS)[number];

/**
 * The menu down the side, in the order an owner sets the business up: who we are, how
 * leads come in, how we price, how projects run, what we tell people, after-sales, and
 * finally the logs. Small groups, each about one thing.
 */
export const MENU: readonly NavGroup<Section>[] = [
  { key: 'company', items: ['company', 'roles', 'workforce', 'rewards'] },
  {
    key: 'leads',
    items: ['leadSteps', 'leadAssignment', 'leadCampaigns', 'whatsappOnboarding', 'referrals'],
  },
  { key: 'pricing', items: ['products', 'rates', 'payments', 'approvals'] },
  { key: 'projects', items: ['projectTypes', 'tasks', 'documents', 'discoms', 'assignment'] },
  { key: 'messages', items: ['messages', 'reminders', 'dashboard'] },
  { key: 'afterSales', items: ['serviceSla', 'warranty', 'amcPlans'] },
  { key: 'system', items: ['automation', 'activity'] },
];

/** The menu with only the sections this person may open, and no empty groups. */
export function visibleMenu(allowed: readonly Section[]): NavGroup<Section>[] {
  return MENU.map((group) => ({
    ...group,
    items: group.items.filter((value) => allowed.includes(value)),
  })).filter((group) => group.items.length > 0);
}

/** The section asked for when the person may open it, else the first one in the menu. */
export function openSection(
  menu: readonly NavGroup<Section>[],
  requested: string | null,
): Section | undefined {
  const items = menu.flatMap((group) => group.items);
  return items.find((value) => value === requested) ?? items[0];
}
