export const ALERTS = {
  bell: (unread: number) => (unread === 0 ? 'Updates' : `Updates, ${unread} new`),
  title: 'Updates',
  overline: 'YOUR INBOX',
  loading: 'Loading your updates',
  markAll: 'Mark all read',
  emptyTitle: 'Nothing new yet',
  emptyBody: 'Project steps, payments and service replies show up here and on your phone.',
} as const;
