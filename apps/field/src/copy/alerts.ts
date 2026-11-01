export const ALERTS = {
  bell: (unread: number) => (unread === 0 ? 'Alerts' : `Alerts, ${unread} unread`),
  title: 'Alerts',
  overline: 'INBOX',
  loading: 'Loading your alerts',
  markAll: 'Mark all read',
  emptyTitle: 'Nothing new',
  emptyBody: 'New tasks, approvals and leave decisions show up here and on your phone.',
} as const;
