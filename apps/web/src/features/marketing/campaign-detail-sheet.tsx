'use client';

import type { CampaignDetail } from '@oneohm/api-contracts';
import { Sheet, Skeleton } from '@oneohm/design-system/web';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useFormatter, useTranslations } from 'next-intl';
import { LoadError } from '@/components/query-state';
import { api, expectStatus } from '@/lib/api/api-client';
import { CampaignActions } from './campaign-actions';
import { CampaignThumb } from './campaign-thumb';
import { ChannelRow } from './channel-icons';
import { CopyLine } from './copy-line';
import { DetailNumbers } from './detail-numbers';
import { LookPill } from './look-pill';
import { mediaSrc } from './marketing-words';
import { PlacementList } from './placement-list';
import { marketingKeys, useCampaignDetail } from './use-marketing';

function Leads({ detail }: { readonly detail: CampaignDetail }) {
  const t = useTranslations('marketing');
  const format = useFormatter();
  return (
    <section className="flex flex-col gap-2">
      <h3 className="type-title-md text-ink">{t('detail.leads')}</h3>
      {detail.leads.length === 0 ? (
        <p className="type-body-sm text-ink-muted">{t('detail.noLeads')}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-hairline rounded-xl border border-hairline bg-raised">
          {detail.leads.slice(0, 8).map((lead) => (
            <li key={lead.id}>
              <Link
                href={`/leads/${lead.id}`}
                className="flex items-center justify-between gap-3 px-3 py-2.5 transition-colors hover:bg-sunken/60"
              >
                <span className="flex min-w-0 flex-col">
                  <span className="truncate type-body text-ink">{lead.name}</span>
                  <span className="truncate type-body-sm text-ink-faint">{lead.city}</span>
                </span>
                <span className="shrink-0 type-body-sm text-ink-muted">
                  {format.dateTime(new Date(lead.createdAt), { day: 'numeric', month: 'short' })}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Detail({ detail }: { readonly detail: CampaignDetail }) {
  const t = useTranslations('marketing');
  const queryClient = useQueryClient();
  const retry = useMutation({
    mutationFn: () =>
      expectStatus(api.marketing.runAgain({ params: { id: detail.id }, body: {} }), 200),
    onSuccess: (next) => {
      queryClient.setQueryData(marketingKeys.campaign(detail.id), next);
      void queryClient.invalidateQueries({ queryKey: marketingKeys.overview });
    },
  });
  const photo = mediaSrc(detail.mediaUrl);
  return (
    <div className="flex flex-col gap-6 p-5 sm:p-6">
      {photo && detail.mediaKind === 'image' ? (
        // biome-ignore lint/performance/noImgElement: an API path, not a static asset
        <img src={photo} alt="" className="max-h-72 w-full rounded-xl object-cover" />
      ) : (
        <CampaignThumb url={detail.mediaUrl} kind={detail.mediaKind} className="h-40 w-full" />
      )}
      <div className="flex flex-col gap-2">
        <p className="type-body text-ink-muted">{detail.code}</p>
        <div className="flex flex-wrap items-center gap-2">
          <LookPill card={detail} size="md" />
          <ChannelRow channels={detail.channels} />
        </div>
        <CampaignActions card={detail} />
      </div>
      <DetailNumbers detail={detail} />
      <section className="flex flex-col gap-2">
        <h3 className="type-title-md text-ink">{t('detail.places')}</h3>
        <PlacementList
          placements={detail.placements}
          canRetry={detail.actions.runAgain}
          retrying={retry.isPending}
          onRetry={() => retry.mutate()}
        />
      </section>
      <section className="flex flex-col gap-3">
        <CopyLine label={t('detail.opener')} value={detail.opener} />
        {detail.landingUrl && <CopyLine label={t('detail.landing')} value={detail.landingUrl} />}
      </section>
      <Leads detail={detail} />
    </div>
  );
}

/** One campaign in full: photo, numbers with trends, each place, what to share, who came. */
export function CampaignDetailSheet({
  id,
  onClose,
}: {
  readonly id: string | null;
  readonly onClose: () => void;
}) {
  const t = useTranslations('marketing');
  const query = useCampaignDetail(id);
  return (
    <Sheet
      open={id !== null}
      onOpenChange={(next) => !next && onClose()}
      title={query.data?.name ?? t('detail.title')}
      width="lg"
    >
      {query.isError ? (
        <div className="p-5">
          <LoadError error={query.error} onRetry={() => query.refetch()} />
        </div>
      ) : query.data ? (
        <Detail detail={query.data} />
      ) : (
        <div className="flex flex-col gap-4 p-5" role="status" aria-label={t('loading')}>
          <Skeleton className="h-48 w-full rounded-xl" />
          <Skeleton className="h-8 w-1/2" />
          <Skeleton className="h-24 w-full rounded-xl" />
        </div>
      )}
    </Sheet>
  );
}
