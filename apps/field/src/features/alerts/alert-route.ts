/** Where an alert opens: a pathname with params, or a plain path. */
export type AlertRoute =
  | { readonly pathname: string; readonly params: { readonly id: string } }
  | string;

/**
 * Alerts with no subject, by kind. Covering for a leaver: Today lists the tasks and
 * follow-ups now theirs. Payout details: the field app has no finance screen, so Today.
 */
const KIND_ROUTE: Readonly<Record<string, string>> = {
  departure_cover: '/',
  payout_details_changed: '/',
};

/** The screen an alert is about: a task, a service visit, leave, or Today for the rest. */
export function alertRoute(
  subject: { readonly type?: string | undefined; readonly id?: string | undefined },
  kind?: string,
): AlertRoute {
  const { type, id } = subject;
  if (type === 'task' && id) return { pathname: '/tasks/[id]', params: { id } };
  if (type === 'service_request' && id) return { pathname: '/service/[id]', params: { id } };
  if (type === 'lead' && id) return { pathname: '/leads/[id]', params: { id } };
  // A customer wrote on WhatsApp, or asked for a person: open that chat.
  if (type === 'chat' && id) return { pathname: '/chats/[id]', params: { id } };
  if (type === 'leave') return '/leave';
  // Points, recognition and bonuses (PRD 4.7).
  if (type === 'points') return '/rewards';
  return (kind && KIND_ROUTE[kind]) ?? '/';
}
