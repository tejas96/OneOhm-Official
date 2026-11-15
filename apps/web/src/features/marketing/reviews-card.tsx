'use client';

import type { MarketingOverview, MarketingReview } from '@oneohm/api-contracts';
import { Badge, Button, cn, listItemEnter, Sheet } from '@oneohm/design-system/web';
import { useQueryClient } from '@tanstack/react-query';
import { Star } from 'lucide-react';
import { motion } from 'motion/react';
import { useFormatter, useTranslations } from 'next-intl';
import { useState } from 'react';
import { api, expectStatus } from '@/lib/api/api-client';
import { starsOf } from './marketing-words';
import { marketingKeys } from './use-marketing';

function Stars({ rating, label }: { readonly rating: number; readonly label: string }) {
  const filled = starsOf(rating).filter(Boolean).length;
  return (
    <span role="img" aria-label={label} className="inline-flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((position) => (
        <Star
          key={position}
          aria-hidden
          className={cn('size-3.5', position <= filled ? 'fill-energy text-energy' : 'text-rule')}
        />
      ))}
    </span>
  );
}

function ReviewLine({
  review,
  full,
}: {
  readonly review: MarketingReview;
  readonly full: boolean;
}) {
  const t = useTranslations('marketing');
  const format = useFormatter();
  return (
    <li className="flex flex-col gap-1 py-2">
      <div className="flex items-center gap-2">
        <span className="min-w-0 truncate type-body font-medium text-ink">{review.author}</span>
        <Stars rating={review.rating} label={t('reviews.stars', { count: review.rating })} />
        {review.isNew && <Badge variant="accent">{t('reviews.new')}</Badge>}
        {full && review.publishedAt && (
          <span className="ml-auto type-body-sm text-ink-faint">
            {format.dateTime(new Date(review.publishedAt), { day: 'numeric', month: 'short' })}
          </span>
        )}
      </div>
      {review.text && (
        <p className={cn('type-body-sm text-ink-muted', !full && 'line-clamp-2')}>{review.text}</p>
      )}
    </li>
  );
}

/** Google reviews: the rating, what is new, the latest three. Opening it marks them seen. */
export function ReviewsCard({
  reviews,
  index,
  onConnections,
}: {
  readonly reviews: MarketingOverview['reviews'];
  readonly index: number;
  readonly onConnections: () => void;
}) {
  const t = useTranslations('marketing');
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const noReviews = reviews.total === 0 && reviews.rating === null;
  const show = () => {
    setOpen(true);
    if (reviews.newCount > 0)
      void expectStatus(api.marketing.reviewsSeen({ body: {} }), 204)
        .then(() => queryClient.invalidateQueries({ queryKey: marketingKeys.overview }))
        .catch(() => undefined);
  };
  return (
    <motion.li
      layout
      {...listItemEnter(index)}
      className="relative flex flex-col gap-3 rounded-xl border border-hairline bg-raised p-4 transition-[box-shadow,border-color,transform] duration-(--duration-base) ease-standard hover:-translate-y-0.5 hover:border-rule hover:shadow-e2"
    >
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={noReviews ? onConnections : show}
          className="oh-stretched-link text-left type-title-md text-ink outline-offset-4"
        >
          {t('reviews.title')}
        </button>
        {reviews.newCount > 0 && (
          <Badge variant="accent">{t('reviews.newCount', { count: reviews.newCount })}</Badge>
        )}
      </div>
      {noReviews ? (
        <p className="type-body-sm text-ink-muted">{t('reviews.empty')}</p>
      ) : (
        <>
          <div className="flex items-center gap-2">
            <span className="type-display-md text-ink tabular-nums">
              {reviews.rating?.toFixed(1) ?? '—'}
            </span>
            <div className="flex flex-col gap-0.5">
              <Stars
                rating={reviews.rating ?? 0}
                label={t('reviews.stars', { count: Math.round(reviews.rating ?? 0) })}
              />
              <span className="type-body-sm text-ink-faint">
                {t('reviews.total', { count: reviews.total })}
              </span>
            </div>
          </div>
          <ul className="flex flex-col divide-y divide-hairline">
            {reviews.latest.slice(0, 3).map((review) => (
              <ReviewLine key={review.id} review={review} full={false} />
            ))}
          </ul>
        </>
      )}
      <p className="type-body-sm text-ink-faint">{t('reviews.asked', { count: reviews.asked })}</p>
      <Sheet
        open={open}
        onOpenChange={setOpen}
        title={t('reviews.title')}
        footer={
          <Button variant="quiet" onClick={() => setOpen(false)}>
            {t('close')}
          </Button>
        }
      >
        <ul className="flex flex-col divide-y divide-hairline px-5 py-2 sm:px-6">
          {reviews.latest.map((review) => (
            <ReviewLine key={review.id} review={review} full />
          ))}
        </ul>
      </Sheet>
    </motion.li>
  );
}
