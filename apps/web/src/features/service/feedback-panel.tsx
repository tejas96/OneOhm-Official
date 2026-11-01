'use client';

import { EmptyState, listItemEnter } from '@oneohm/design-system/web';
import { useQuery } from '@tanstack/react-query';
import { Star } from 'lucide-react';
import { motion } from 'motion/react';
import Link from 'next/link';
import { useFormatter, useNow, useTranslations } from 'next-intl';
import { ListSkeleton, LoadError } from '@/components/query-state';
import { api, expectStatus } from '@/lib/api/api-client';

function Stars({ rating }: { readonly rating: number }) {
  return (
    <span className="flex gap-0.5" role="img" aria-label={`${rating} / 5`}>
      {[1, 2, 3, 4, 5].map((value) => (
        <Star
          key={value}
          aria-hidden
          className={value <= rating ? 'size-4 fill-energy text-energy' : 'size-4 text-rule'}
        />
      ))}
    </span>
  );
}

/** What customers said after handover, newest first, with the average on top. */
export function FeedbackPanel() {
  const t = useTranslations('service.feedback');
  const format = useFormatter();
  const now = useNow();
  const query = useQuery({
    queryKey: ['feedback'],
    queryFn: () => expectStatus(api.serviceDesk.listFeedback(), 200),
  });
  if (query.isPending) return <ListSkeleton label={t('loading')} />;
  if (query.isError) return <LoadError error={query.error} onRetry={() => query.refetch()} />;
  if (query.data.length === 0) return <EmptyState icon={<Star />} title={t('empty')} />;
  const average = query.data.reduce((sum, entry) => sum + entry.rating, 0) / query.data.length;
  return (
    <div className="flex flex-col gap-6">
      <p className="flex items-baseline gap-3">
        <span className="type-display-lg text-ink tabular-nums">{average.toFixed(1)}</span>
        <span className="type-body text-ink-muted">
          {t('average', { count: query.data.length })}
        </span>
      </p>
      <ul className="flex flex-col divide-y divide-hairline">
        {query.data.map((entry, index) => (
          <motion.li
            key={entry.id}
            {...listItemEnter(index)}
            className="flex flex-col gap-1.5 py-4"
          >
            <div className="flex flex-wrap items-center gap-3">
              <Stars rating={entry.rating} />
              <Link
                href={`/customers/${entry.customer.id}`}
                className="type-body-sm font-medium text-ink hover:text-accent"
              >
                {entry.customer.name}
              </Link>
              <Link
                href={`/projects/${entry.project.id}`}
                className="font-mono text-[0.75rem] text-ink-faint hover:text-accent"
              >
                {entry.project.code}
              </Link>
              <span className="type-body-sm text-ink-faint">
                {format.relativeTime(new Date(entry.createdAt), now)}
              </span>
            </div>
            {entry.comment && <p className="type-body text-ink-muted">{entry.comment}</p>}
          </motion.li>
        ))}
      </ul>
    </div>
  );
}
