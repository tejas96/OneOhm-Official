'use client';

import type { ProjectDetail } from '@oneohm/api-contracts';
import { Card, CardHeader } from '@oneohm/design-system/web';
import {
  CircleCheck,
  Hourglass,
  IndianRupee,
  type LucideIcon,
  Package,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { useFormatter, useNow, useTranslations } from 'next-intl';

type Activity = ProjectDetail['activities'][number];

const ICONS: Readonly<Record<string, LucideIcon>> = {
  task_completed: CircleCheck,
  waiting: Hourglass,
  payment: IndianRupee,
  review: ShieldCheck,
  material: Package,
};

/** What happened on the project, newest first, with who did it and when. */
export function ActivityTimeline({ activities }: { readonly activities: readonly Activity[] }) {
  const t = useTranslations('projects.activity');
  const format = useFormatter();
  const now = useNow({ updateInterval: 60_000 });
  return (
    <Card className="flex flex-col overflow-hidden">
      <CardHeader title={t('title')} />
      {activities.length === 0 ? (
        <p className="border-t border-hairline px-5 py-5 type-body-sm text-ink-muted">
          {t('empty')}
        </p>
      ) : (
        <ol className="flex flex-col border-t border-hairline px-5 py-4">
          {activities.map((activity, index) => {
            const Icon = ICONS[activity.kind] ?? Sparkles;
            return (
              <li key={activity.id} className="relative flex gap-3 pb-4 last:pb-0">
                {index < activities.length - 1 && (
                  <span
                    aria-hidden
                    className="absolute top-7 bottom-0 left-[13px] w-px bg-hairline"
                  />
                )}
                <span className="relative z-10 flex size-7 shrink-0 items-center justify-center rounded-full bg-sunken text-ink-muted">
                  <Icon aria-hidden className="size-3.5" />
                </span>
                <div className="flex min-w-0 flex-col gap-0.5 pt-1">
                  <p className="type-body-sm text-ink">{activity.message}</p>
                  <p className="type-label text-ink-faint">
                    {activity.user ? `${activity.user.fullName} · ` : ''}
                    <time dateTime={activity.createdAt}>
                      {format.relativeTime(
                        new Date(activity.createdAt),
                        // Never "in 5 seconds": the page clock can lag the server's.
                        new Date(Math.max(now.getTime(), Date.parse(activity.createdAt))),
                      )}
                    </time>
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </Card>
  );
}
