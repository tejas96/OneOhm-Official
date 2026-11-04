import type { NotificationItem } from '@oneohm/api-contracts';
import { hrefWithTask } from '@/features/projects/task-panel/task-panel-url';

type Subject = NonNullable<NotificationItem['subject']>;

/**
 * Where each kind of alert leads on the web: the exact task, payment or record when a page
 * can open it, else the right tab. Every subject needs an entry, so none falls back to home.
 */
const SUBJECT_HREF: Readonly<Record<Subject['type'], (subject: Subject) => string>> = {
  task: ({ id, projectId }) =>
    projectId ? hrefWithTask(`/projects/${projectId}?tab=tasks`, id) : `/today?task=${id}`,
  project: ({ id }) => `/projects/${id}`,
  payment: ({ projectId }) => (projectId ? `/projects/${projectId}?tab=payments` : '/finance'),
  quotation: ({ id }) => `/quotations/${id}`,
  leave: () => '/team?tab=leave',
  correction: () => '/team?tab=attendance',
  points: () => '/team?tab=points',
  travel_claim: () => '/team?tab=travel',
  service_request: ({ id }) => `/service?tab=requests&view=all&request=${id}`,
  purchase_request: ({ id }) => `/inventory?tab=requests&status=all&request=${id}`,
  vendor_advance: () => '/finance?tab=advances',
  stock: () => '/inventory?tab=stock',
  lead: ({ id }) => `/leads/${id}`,
  approval: () => '/today?tab=approvals',
  chat: ({ id }) => `/today?tab=chats&chat=${id}`,
};

/** Notices with no subject, by kind: where the person acts on them. */
const KIND_HREF: Readonly<Record<string, string>> = {
  departure_cover: '/today',
  payout_details_changed: '/finance?tab=payouts',
};

export function hrefOf({ subject, kind }: Pick<NotificationItem, 'subject' | 'kind'>): string {
  if (!subject) return KIND_HREF[kind] ?? '/';
  // Bonus alerts share the points subject; a proposed bonus is decided on its own tab.
  if (subject.type === 'points' && kind === 'bonus_proposed') return '/team?tab=bonuses';
  return SUBJECT_HREF[subject.type](subject);
}
