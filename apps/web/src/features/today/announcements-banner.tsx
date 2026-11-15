'use client';

import type { Announcement } from '@oneohm/api-contracts';
import { IconButton, useToast } from '@oneohm/design-system/web';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Megaphone, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { api, expectStatus } from '@/lib/api/api-client';
import { describeError } from '@/lib/api/api-error';
import { useWorkforceFormat } from '../team/workforce-format';

const MINE_KEY = ['me', 'announcements'] as const;

/** Notices from the owners or HR showing now (PRD 4.1), each one closeable; nothing when none. */
export function AnnouncementsBanner() {
  const t = useTranslations('today.announcements');
  const format = useWorkforceFormat();
  const toast = useToast();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: MINE_KEY,
    queryFn: () => expectStatus(api.engagement.myAnnouncements(), 200),
  });
  const dismiss = useMutation({
    mutationFn: (id: string) =>
      expectStatus(api.engagement.dismissAnnouncement({ params: { id } }), 204),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: MINE_KEY });
      const before = queryClient.getQueryData<Announcement[]>(MINE_KEY);
      queryClient.setQueryData<Announcement[]>(MINE_KEY, (items) =>
        items?.filter((item) => item.id !== id),
      );
      return { before };
    },
    onError: (caught, _id, context) => {
      queryClient.setQueryData(MINE_KEY, context?.before);
      toast({ title: t('failed'), description: describeError(caught), tone: 'error' });
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: MINE_KEY }),
  });

  const items = query.data ?? [];
  if (items.length === 0) return null;
  return (
    <section aria-label={t('label')} className="flex flex-col gap-3">
      {items.map((item) => (
        <article
          key={item.id}
          className="flex items-start gap-3 rounded-lg bg-raised p-4 shadow-e1 ring-1 ring-hairline/70"
        >
          <Megaphone aria-hidden className="mt-1 size-5 shrink-0 text-ink-muted" />
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <h2 className="type-body font-medium text-ink">{item.title}</h2>
            <p className="type-body-sm whitespace-pre-line text-ink-muted">{item.body}</p>
            <p className="type-label text-ink-faint">
              {[
                item.createdBy
                  ? t('posted', { name: item.createdBy.fullName, when: format.ago(item.createdAt) })
                  : format.ago(item.createdAt),
                item.endsOn ? t('until', { date: format.day(item.endsOn) }) : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>
          </div>
          <IconButton
            size="sm"
            label={t('close', { title: item.title })}
            onClick={() => dismiss.mutate(item.id)}
          >
            <X />
          </IconButton>
        </article>
      ))}
    </section>
  );
}
