'use client';

import type { NotificationItem } from '@oneohm/api-contracts';
import { cn, Popover } from '@oneohm/design-system/web';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell } from 'lucide-react';
import Link from 'next/link';
import { useFormatter, useNow, useTranslations } from 'next-intl';
import { useState } from 'react';
import { api, expectStatus } from '@/lib/api/api-client';

const INBOX = ['me', 'inbox'] as const;

/** Where an alert leads on the web: the task's project, or the right Team tab. */
function hrefOf(subject: NotificationItem['subject']): string {
  if (!subject) return '/';
  if (subject.type === 'task' && subject.projectId)
    return `/projects/${subject.projectId}?tab=tasks`;
  if (subject.type === 'project') return `/projects/${subject.id}`;
  if (subject.type === 'leave') return '/team?tab=leave';
  if (subject.type === 'correction') return '/team?tab=attendance';
  if (subject.type === 'points') return '/team?tab=points';
  if (subject.type === 'travel_claim') return '/team?tab=travel';
  if (subject.type === 'service_request')
    return `/service?tab=requests&view=all&request=${subject.id}`;
  if (subject.type === 'purchase_request')
    return `/inventory?tab=requests&status=all&request=${subject.id}`;
  if (subject.type === 'vendor_advance') return '/finance?tab=advances';
  if (subject.type === 'stock') return '/inventory?tab=stock';
  if (subject.type === 'lead') return `/leads/${subject.id}`;
  if (subject.type === 'approval') return '/today?tab=approvals';
  return '/';
}

/** The bell with the unread count; opens the latest alerts, each linking to its work. */
export function AlertsBell({ className }: { readonly className?: string }) {
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
              href={hrefOf(item.subject)}
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
