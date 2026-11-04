'use client';

import type { NotificationItem } from '@oneohm/api-contracts';
import { cn, Popover } from '@oneohm/design-system/web';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell } from 'lucide-react';
import Link from 'next/link';
import { useFormatter, useNow, useTranslations } from 'next-intl';
import { useState } from 'react';
import { hrefWithTask } from '@/features/projects/task-panel/task-panel-url';
import { api, expectStatus } from '@/lib/api/api-client';

const INBOX = ['me', 'inbox'] as const;

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

function hrefOf({ subject, kind }: Pick<NotificationItem, 'subject' | 'kind'>): string {
  if (!subject) return '/';
  // Bonus alerts share the points subject; a proposed bonus is decided on its own tab.
  if (subject.type === 'points' && kind === 'bonus_proposed') return '/team?tab=bonuses';
  return SUBJECT_HREF[subject.type](subject);
}

/** The bell with the unread count; opens the latest alerts, each linking to its work. */
export function AlertsBell({
  className,
  hint = false,
}: {
  readonly className?: string;
  /** Show a hover hint beside the bell, for the collapsed sidebar. */
  readonly hint?: boolean;
}) {
  const t = useTranslations('alerts');
  const format = useFormatter();
  const now = useNow({ updateInterval: 60_000 });
  const client = useQueryClient();
  const [open, setOpen] = useState(false);
  const inbox = useQuery({
    queryKey: INBOX,
    queryFn: () => expectStatus(api.notifications.inbox(), 200),
    refetchInterval: 60_000,
  });
  const markRead = useMutation({
    mutationFn: (ids?: string[]) =>
      expectStatus(api.notifications.markRead({ body: ids ? { ids } : {} }), 204),
    onSuccess: () => client.invalidateQueries({ queryKey: INBOX }),
  });
  const unread = inbox.data?.unread ?? 0;
  const items = inbox.data?.items.slice(0, 12) ?? [];
  return (
    <Popover
      label={t('title')}
      tooltip={hint ? (unread > 0 ? t('bellUnread', { count: unread }) : t('bell')) : undefined}
      open={open}
      onOpenChange={setOpen}
      align="end"
      className="w-[22rem] p-0"
      trigger={
        <button
          type="button"
          aria-label={unread > 0 ? t('bellUnread', { count: unread }) : t('bell')}
          className={cn(
            'relative inline-flex size-9 shrink-0 items-center justify-center rounded-full border border-hairline bg-raised text-ink-muted shadow-e1 hover:text-ink',
            className,
          )}
        >
          <Bell aria-hidden className="size-[1.125rem]" />
          {unread > 0 && (
            <span className="absolute -top-1 -right-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1 font-mono text-[0.6875rem] text-on-accent">
              {unread > 9 ? '9+' : unread}
            </span>
          )}
        </button>
      }
    >
      <div className="flex items-center justify-between gap-3 border-b border-hairline px-4 py-3">
        <p className="type-title-md text-ink">{t('title')}</p>
        {unread > 0 && (
          <button
            type="button"
            onClick={() => markRead.mutate(undefined)}
            className="type-body-sm text-accent hover:underline"
          >
            {t('markAll')}
          </button>
        )}
      </div>
      {inbox.isPending && <p className="px-4 py-6 type-body-sm text-ink-muted">{t('loading')}</p>}
      {inbox.isError && <p className="px-4 py-6 type-body-sm text-overdue">{t('loadError')}</p>}
      {inbox.data && items.length === 0 && (
        <div className="flex flex-col gap-1 px-4 py-6">
          <p className="type-body-sm font-medium text-ink">{t('emptyTitle')}</p>
          <p className="type-body-sm text-ink-muted">{t('emptyBody')}</p>
        </div>
      )}
      <ul className="max-h-[26rem] divide-y divide-hairline overflow-y-auto">
        {items.map((item) => (
          <li key={item.id}>
            <Link
              href={hrefOf(item)}
              onClick={() => {
                if (!item.read) markRead.mutate([item.id]);
                setOpen(false);
              }}
              className="flex gap-3 px-4 py-3 hover:bg-sunken/60"
            >
              <span
                aria-hidden
                className={cn(
                  'mt-1.5 size-2 shrink-0 rounded-full',
                  item.read ? 'bg-transparent' : 'bg-accent',
                )}
              />
              <span className="flex min-w-0 flex-col gap-0.5">
                <span
                  className={cn(
                    'type-body-sm font-medium',
                    item.read ? 'text-ink-muted' : 'text-ink',
                  )}
                >
                  {item.title}
                </span>
                <span className="type-body-sm text-ink-muted">{item.body}</span>
                <span className="type-label text-ink-faint">
                  {format.relativeTime(new Date(item.createdAt), now)}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </Popover>
  );
}
