'use client';

import type { MarketingConnections } from '@oneohm/api-contracts';
import { Button, Card, Input, Switch } from '@oneohm/design-system/web';
import { useMutation } from '@tanstack/react-query';
import { MapPin, Search } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { FormError } from '@/components/form-error';
import { api, expectStatus } from '@/lib/api/api-client';
import { describeError } from '@/lib/api/api-error';
import { useSaveSettings } from './use-save-settings';

/** Google reviews: find the business on Maps once, and choose whether finished customers are asked. */
export function ReviewsSetupCard({ data }: { readonly data: MarketingConnections }) {
  const t = useTranslations('marketing');
  const { form, save } = useSaveSettings();
  const [query, setQuery] = useState('');
  const find = useMutation({
    mutationFn: (q: string) =>
      expectStatus(api.marketing.findPlace({ query: q ? { q } : {} }), 200),
  });
  const pick = (id: string) => save({ ...data.settings, googlePlaceId: id }, t('toast.placeSaved'));
  return (
    <Card className="flex flex-col gap-4 p-5">
      <div className="flex flex-col gap-0.5">
        <h2 className="type-title-md text-ink">{t('reviewsSetup.title')}</h2>
        <p className="type-body-sm text-ink-muted">{t('reviewsSetup.intro')}</p>
      </div>
      {data.place && (
        <p className="flex items-start gap-2 rounded-md bg-on-track-tint px-3 py-2 type-body-sm text-on-track">
          <MapPin aria-hidden className="mt-0.5 size-4 shrink-0" />
          <span>
            <span className="font-medium">{data.place.name}</span>
            {data.place.address && ` · ${data.place.address}`}
          </span>
        </p>
      )}
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          aria-label={t('reviewsSetup.search')}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t('reviewsSetup.placeholder')}
          onKeyDown={(event) => event.key === 'Enter' && find.mutate(query.trim())}
        />
        <Button
          leadingIcon={<Search />}
          pending={find.isPending}
          onClick={() => find.mutate(query.trim())}
        >
          {t('reviewsSetup.find')}
        </Button>
      </div>
      {find.isError && <FormError message={describeError(find.error)} />}
      {find.data && find.data.length === 0 && (
        <p className="type-body-sm text-ink-muted">{t('reviewsSetup.none')}</p>
      )}
      {find.data && find.data.length > 0 && (
        <ul className="flex flex-col divide-y divide-hairline rounded-lg border border-hairline">
          {find.data.map((place) => (
            <li key={place.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
              <span className="flex min-w-0 flex-col">
                <span className="truncate type-body text-ink">{place.name}</span>
                <span className="truncate type-body-sm text-ink-faint">{place.address}</span>
              </span>
              <Button
                size="sm"
                variant="secondary"
                disabled={form.pending}
                onClick={() => pick(place.id)}
              >
                {t('reviewsSetup.thisOne')}
              </Button>
            </li>
          ))}
        </ul>
      )}
      <FormError message={form.error} />
      <Switch
        checked={data.settings.askForReviews}
        onCheckedChange={(askForReviews) => save({ ...data.settings, askForReviews })}
        label={t('reviewsSetup.ask')}
        description={t('reviewsSetup.askHint')}
        disabled={form.pending}
      />
    </Card>
  );
}
