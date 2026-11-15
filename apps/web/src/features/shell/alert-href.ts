import type { NotificationItem } from '@oneohm/api-contracts';
import { hrefWithTask } from '@/features/projects/task-panel/task-panel-url';

type Subject = NonNullable<NotificationItem['subject']>;

/**
 * Where each kind of alert leads on the web: the exact task, payment or record when a page
 * can open it, else the right tab. Every subject needs an entry, so none falls back to home.
 * An alert that asks for a decision names the item, so the page opens on it; an alert that
 * tells someone the outcome opens their tab.
 */
const SUBJECT_HREF: Readonly<Record<Subject['type'], (subject: Subject, kind: string) => string>> =
  {
    task: ({ id, projectId }) =>
      projectId ? hrefWithTask(`/projects/${projectId}?tab=tasks`, id) : `/today?task=${id}`,
    project: ({ id }) => `/projects/${id}`,
    payment: ({ projectId }) => (projectId ? `/projects/${projectId}?tab=payments` : '/finance'),
    quotation: ({ id }) => `/quotations/${id}`,
    // Cover asks, answers and cancellations all land on the Leave tab, where the list is.
    leave: ({ id }, kind) =>
      kind === 'leave_requested' ? `/team?tab=leave&leave=${id}` : '/team?tab=leave',
    correction: ({ id }, kind) =>
      kind === 'correction_requested'
        ? `/team?tab=attendance&correction=${id}`
        : '/team?tab=attendance',
    points: ({ id }, kind) => {
      // Bonus alerts share the points subject; a bonus is decided on its own tab.
      if (kind === 'bonus_proposed') return `/team?tab=bonuses&bonus=${id}`;
      if (kind.startsWith('bonus_')) return '/team?tab=bonuses';
      return '/team?tab=points';
    },
    // The claim's own sheet shows it whatever its state: asked, decided, voided or paid.
    travel_claim: ({ id }) => `/team?tab=travel&claim=${id}`,
    service_request: ({ id }) => `/service?tab=requests&view=all&request=${id}`,
    purchase_request: ({ id }) => `/inventory?tab=requests&status=all&request=${id}`,
    vendor_advance: ({ id }) => `/finance?tab=advances&filter=pending&advance=${id}`,
    // Bank transfer alerts: the bill itself, whatever happened to the money.
    payable: ({ id }) => `/finance?tab=payables&bill=${id}`,
    // Bank detail alerts: the vendor's or crew's own page.
    vendor: ({ id }) => `/inventory/vendors/${id}`,
    contractor: ({ id }) => `/contractors/${id}`,
    stock: () => '/inventory?tab=stock',
    lead: ({ id }) => `/leads/${id}`,
    approval: () => '/today?tab=approvals',
    chat: ({ id }) => `/today?tab=chats&chat=${id}`,
    marketing: ({ id }) => `/marketing?campaign=${id}`,
    marketing_connections: () => '/marketing?tab=connections',
    marketing_reviews: () => '/marketing',
  };

/** Notices with no subject, by kind: where the person acts on them. */
const KIND_HREF: Readonly<Record<string, string>> = {
  departure_cover: '/today',
  payout_details_changed: '/finance?tab=payouts',
  // An employee's bank details changed or were released (vendors and crews name their own page).
  payee_bank_changed: '/finance?tab=payables',
  payee_bank_hold_released: '/finance?tab=payables',
  // The RazorpayX check is failing; no single bill is to blame.
  payout_sync_failing: '/finance?tab=payables',
  // The night job ended a day nobody ended; the Attendance list is where the times are fixed.
  attendance_auto_closed: '/team?tab=attendance',
  // A scheduled job failed after its retries; the job log is in Settings, under Automation.
  job_failed: '/settings?tab=automation',
};

/**
 * A Marketing alert: a campaign opens itself; `connections` and `reviews` are not campaigns,
 * so they open the Connections tab and the Marketing page.
 */
export function hrefOf({ subject, kind }: Pick<NotificationItem, 'subject' | 'kind'>): string {
  if (!subject) return KIND_HREF[kind] ?? '/';
  return SUBJECT_HREF[subject.type](subject, kind);
}
