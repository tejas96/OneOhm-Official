'use client';

import { Avatar, Badge, Button, Skeleton } from '@oneohm/design-system/web';
import { useQuery } from '@tanstack/react-query';
import { MapPin, Zap } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { LoadError } from '@/components/query-state';
import { LowIncomeSwitch } from '@/features/state-support/low-income-switch';
import { api, expectStatus } from '@/lib/api/api-client';
import { useCan } from '@/providers/current-user';
import { SubsidyClaimedSwitch } from './subsidy-claimed-switch';

/** The property with its customer; shared by the builder and the project dialog. */
export function useProperty(propertyId: string | null) {
  return useQuery({
    queryKey: ['property', propertyId],
    queryFn: () => expectStatus(api.crm.getProperty({ params: { id: propertyId ?? '' } }), 200),
    enabled: propertyId !== null,
    staleTime: 60_000,
  });
}

export function useDiscoms() {
  return useQuery({
    queryKey: ['discoms'],
    queryFn: () => expectStatus(api.catalog.listDiscoms(), 200),
    staleTime: 10 * 60_000,
  });
}

/** The chosen customer and site, with the facts that shape the price. */
export function PropertySummary({
  propertyId,
  onChange,
}: {
  readonly propertyId: string;
  /** Pick a different customer or site; omitted where the property is fixed. */
  readonly onChange?: () => void;
}) {
  const t = useTranslations('quotations.builder.customer');
  const categoryT = useTranslations('quotations.category');
  const lowIncomeT = useTranslations('stateSupport.household');
  const property = useProperty(propertyId);
  const discoms = useDiscoms();
  const canMarkSubsidy = useCan('subsidy.manage', 'customers.manage');
  if (property.isPending) return <Skeleton className="h-28 w-full rounded-xl" />;
  if (property.isError) {
    return <LoadError error={property.error} onRetry={() => property.refetch()} />;
  }
  const site = property.data;
  const discom = discoms.data?.find((entry) => entry.id === site.discomId);
  return (
    <div className="flex flex-col gap-4 rounded-xl border border-hairline bg-raised p-4 sm:flex-row sm:items-start">
      <Avatar name={site.customer.name} swatch={2} />
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex flex-col">
          <p className="type-title-md text-ink">{site.customer.name}</p>
          <p className="type-body-sm text-ink-faint">{site.customer.phone}</p>
        </div>
        <p className="flex items-start gap-2 type-body-sm text-ink-muted">
          <MapPin aria-hidden className="mt-0.5 size-4 shrink-0 text-ink-faint" />
          <span>
            <span className="text-ink">{site.label}</span> · {site.addressLine}, {site.city}
          </span>
        </p>
        <div className="flex flex-wrap gap-2">
          <Badge variant="soft">{categoryT(site.subsidyCategory)}</Badge>
          <Badge variant="outline">{t('floors', { count: site.floors })}</Badge>
          {discom && (
            <Badge variant="outline">
              <Zap aria-hidden className="size-3" />
              {discom.code}
              {site.consumerNumber ? ` · ${site.consumerNumber}` : ''}
            </Badge>
          )}
          {site.subsidyClaimed && <Badge variant="accent">{t('subsidyClaimed')}</Badge>}
          {site.lowIncomeHousehold && <Badge variant="soft">{lowIncomeT('badge')}</Badge>}
        </div>
        {onChange && canMarkSubsidy && (
          <SubsidyClaimedSwitch propertyId={site.id} claimed={site.subsidyClaimed} />
        )}
        {onChange && canMarkSubsidy && site.subsidyCategory === 'individual' && (
          <LowIncomeSwitch propertyId={site.id} lowIncome={site.lowIncomeHousehold ?? false} />
        )}
      </div>
      {onChange && (
        <Button variant="quiet" size="sm" onClick={onChange}>
          {t('change')}
        </Button>
      )}
    </div>
  );
}
