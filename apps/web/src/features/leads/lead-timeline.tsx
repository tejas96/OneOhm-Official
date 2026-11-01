'use client';

import type { LeadDetail } from '@oneohm/api-contracts';
import { cn, listItemEnter } from '@oneohm/design-system/web';
import {
  CalendarClock,
  type LucideIcon,
  MapPin,
  MessageCircle,
  MoveRight,
  NotebookPen,
  PhoneCall,
} from 'lucide-react';
import { motion } from 'motion/react';
import { useFormatter, useTranslations } from 'next-intl';

type Activity = LeadDetail['activities'][number];

const KIND_ICON: Readonly<Record<Activity['kind'], LucideIcon>> = {
  note: NotebookPen,
  call: PhoneCall,
  visit: MapPin,
  whatsapp: MessageCircle,
  stage_change: MoveRight,
  follow_up: CalendarClock,
};

const KIND_DISC: Readonly<Record<Activity['kind'], string>> = {
  note: 'bg-sunken text-ink-muted',
  call: 'bg-accent-soft text-accent',
  visit: 'bg-energy-soft text-on-track',
  whatsapp: 'bg-on-track-tint text-on-track',
  stage_change: 'bg-review-tint text-review',
  follow_up: 'bg-waiting-tint text-waiting',
};

/** Everything that happened on the lead, newest first, on a quiet vertical rule. */
export function LeadTimeline({ activities }: { readonly activities: readonly Activity[] }) {
  const t = useTranslations('leads.timeline');
  const format = useFormatter();
  if (activities.length === 0) {
    return <p className="type-body-sm text-ink-faint">{t('empty')}</p>;
  }
  return (
    <ol className="relative flex flex-col">
      <span aria-hidden className="absolute top-3 bottom-3 left-[1.1875rem] w-px bg-hairline" />
      {activities.map((activity, index) => {
        const Icon = KIND_ICON[activity.kind];
        const when = new Date(activity.createdAt);
        return (
          <motion.li
            key={activity.id}
            {...listItemEnter(index)}
            className="relative flex gap-4 py-3"
          >
            <span
              className={cn(
                'relative z-10 flex size-10 shrink-0 items-center justify-center rounded-full ring-4 ring-canvas',
                KIND_DISC[activity.kind],
              )}
            >
              <Icon aria-hidden className="size-4" />
            </span>
            <div className="flex min-w-0 flex-1 flex-col gap-1 pt-1">
              <p className="flex flex-wrap items-baseline gap-x-2 type-label text-ink-faint">
                <span className="font-medium text-ink-muted">{t(`kind.${activity.kind}`)}</span>
                <span>·</span>
                <time dateTime={activity.createdAt}>
                  {format.dateTime(when, {
                    day: 'numeric',
                    month: 'short',
                    hour: 'numeric',
                    minute: '2-digit',
                  })}
                </time>
                {activity.user && (
                  <>
                    <span>·</span>
                    <span>{activity.user.fullName}</span>
                  </>
                )}
              </p>
              <p className="type-body whitespace-pre-line text-ink">{activity.note}</p>
            </div>
          </motion.li>
        );
      })}
    </ol>
  );
}
