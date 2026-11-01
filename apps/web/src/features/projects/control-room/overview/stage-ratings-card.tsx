'use client';

import type { StageRating } from '@oneohm/api-contracts';
import { Button, Card, CardHeader, Textarea, useToast } from '@oneohm/design-system/web';
import { LOW_RATING } from '@oneohm/domain';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Star } from 'lucide-react';
import { useFormatter, useNow, useTranslations } from 'next-intl';
import { useState } from 'react';
import { useBrandName } from '@/features/shell/company-name';
import { api, expectStatus } from '@/lib/api/api-client';
import { describeError } from '@/lib/api/api-error';
import { useCan } from '@/providers/current-user';

const key = (projectId: string) => ['projects', projectId, 'stage-ratings'];

/** What the customer said about each finished stage, and OneOhm's reply (PRD 5.7). */
export function StageRatingsCard({ projectId }: { readonly projectId: string }) {
  const t = useTranslations('projects.room.ratings');
  const query = useQuery({
    queryKey: key(projectId),
    queryFn: () =>
      expectStatus(api.stageRatings.projectStageRatings({ params: { id: projectId } }), 200),
  });
  return (
    <Card>
      <CardHeader title={t('title')} />
      <div className="flex flex-col gap-4 px-5 pb-5">
        {query.data?.length === 0 && <p className="type-body-sm text-ink-faint">{t('empty')}</p>}
        {query.data?.map((rating) => (
          <RatingItem key={rating.id} projectId={projectId} rating={rating} />
        ))}
      </div>
    </Card>
  );
}

function RatingItem({
  projectId,
  rating,
}: {
  readonly projectId: string;
  readonly rating: StageRating;
}) {
  const t = useTranslations('projects.room.ratings');
  const format = useFormatter();
  const now = useNow();
  const brand = useBrandName();
  const toast = useToast();
  const client = useQueryClient();
  const canReply = useCan('projects.manage', 'customers.manage');
  const [reply, setReply] = useState('');
  const send = useMutation({
    mutationFn: () =>
      expectStatus(
        api.stageRatings.replyToStageRating({ params: { id: rating.id }, body: { reply } }),
        200,
      ),
    onSuccess: async () => {
      setReply('');
      await client.invalidateQueries({ queryKey: key(projectId) });
      toast({ tone: 'success', title: t('replied') });
    },
    onError: (error) =>
      toast({ tone: 'error', title: t('failed'), description: describeError(error) }),
  });
  const low = rating.rating <= LOW_RATING;
  return (
    <article className="flex flex-col gap-2 border-t border-hairline pt-4 first:border-t-0 first:pt-0">
      <header className="flex items-center justify-between gap-3">
        <span className="type-body-sm font-medium text-ink">{t(`stage.${rating.stage}`)}</span>
        <span
          className={`flex items-center gap-1 type-body-sm tabular-nums ${low ? 'text-overdue' : 'text-ink'}`}
        >
          <Star aria-hidden className="size-4 fill-current" />
          <span aria-hidden>{rating.rating}/5</span>
          <span className="sr-only">{t('stars', { rating: rating.rating })}</span>
        </span>
      </header>
      {rating.comment && <p className="type-body-sm text-ink-muted">“{rating.comment}”</p>}
      {rating.people.length > 0 && (
        <p className="type-label text-ink-faint">
          {rating.people.map((person) => `${person.name} ${person.rating ?? '—'}★`).join(' · ')}
        </p>
      )}
      <p className="type-label text-ink-faint">
        {format.relativeTime(new Date(rating.createdAt), now)}
      </p>
      {rating.reply ? (
        <p className="rounded-md bg-sunken px-3 py-2 type-body-sm text-ink-muted">
          {t('replyBy', { name: rating.repliedBy ?? brand })} {rating.reply}
        </p>
      ) : (
        canReply && (
          <div className="flex flex-col gap-2">
            <Textarea
              value={reply}
              rows={2}
              maxLength={1000}
              placeholder={t(low ? 'replyLowPlaceholder' : 'replyPlaceholder')}
              aria-label={t('replyLabel')}
              onChange={(event) => setReply(event.target.value)}
            />
            <Button
              size="sm"
              variant="secondary"
              className="self-end"
              pending={send.isPending}
              disabled={reply.trim().length < 2}
              onClick={() => send.mutate()}
            >
              {t('reply')}
            </Button>
          </div>
        )
      )}
    </article>
  );
}
