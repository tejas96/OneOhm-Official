'use client';

import { Skeleton, SkeletonGroup, useToast } from '@oneohm/design-system/web';
import { CircleAlert } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { LoadError } from '@/components/query-state';
import { DefaultsForm } from './defaults-form';
import { PracticeRibbon } from './practice-ribbon';
import { ProviderCard } from './provider-card';
import { ReviewsSetupCard } from './reviews-setup-card';
import { TemplatesCard } from './templates-card';
import { useMarketingConnections } from './use-marketing';
import type { MarketingUrl } from './use-marketing-url';

/** Shows the one-time "connected" or error word from the sign-in return, then cleans the address. */
function useReturnNotice(url: MarketingUrl) {
  const toast = useToast();
  const t = useTranslations('marketing');
  const { connected, error, clearNotice } = url;
  useEffect(() => {
    if (connected)
      toast({
        title: t('connections.justConnected', { place: t(`provider.${connected}`) }),
        tone: 'success',
      });
    if (connected || error) clearNotice();
  }, [connected, error, clearNotice, toast, t]);
}

/** Meta, Google, WhatsApp messages, Google reviews and the defaults, in the order people need them. */
export function ConnectionsTab({ url }: { readonly url: MarketingUrl }) {
  const t = useTranslations('marketing');
  const query = useMarketingConnections();
  const [returnError] = useState(url.error);
  useReturnNotice(url);
  if (query.isPending)
    return (
      <SkeletonGroup label={t('loading')} className="grid gap-4 md:grid-cols-2">
        <Skeleton className="h-44 rounded-xl" />
        <Skeleton className="h-44 rounded-xl" />
        <Skeleton className="h-56 rounded-xl md:col-span-2" />
      </SkeletonGroup>
    );
  if (query.isError) return <LoadError error={query.error} onRetry={() => query.refetch()} />;
  const data = query.data;
  return (
    <div className="flex flex-col gap-4">
      {data.mode === 'sandbox' && <PracticeRibbon />}
      {returnError && (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-lg bg-at-risk-tint px-3 py-2.5 type-body-sm text-ink"
        >
          <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-at-risk" />
          {t('connections.returnError', { reason: returnError })}
        </p>
      )}
      <div className="grid gap-4 md:grid-cols-2">
        <ProviderCard connection={data.meta} />
        <ProviderCard connection={data.google} />
      </div>
      <TemplatesCard ready={data.whatsapp.ready} templates={data.whatsapp.templates} />
      <ReviewsSetupCard data={data} />
      <DefaultsForm data={data} />
    </div>
  );
}
