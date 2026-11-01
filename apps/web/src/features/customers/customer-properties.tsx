'use client';

import type { Property } from '@oneohm/api-contracts';
import { Badge, Button, Card, listItemEnter } from '@oneohm/design-system/web';
import { formatKwp } from '@oneohm/shared';
import { useQuery } from '@tanstack/react-query';
import { FileCog, FilePlus2, MapPin, PencilLine } from 'lucide-react';
import { motion } from 'motion/react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { type ReactNode, useState } from 'react';
import { RaiseChangeRequestDialog } from '@/features/discom/raise-change-request-dialog';
import { api, expectStatus } from '@/lib/api/api-client';
import { useCan } from '@/providers/current-user';
import { EditPropertyDialog } from './edit-property-dialog';

/** Each site the customer owns, with its electricity connection set out for DISCOM work. */
export function CustomerProperties({ properties }: { readonly properties: readonly Property[] }) {
  const t = useTranslations('customers.property');
  const discoms = useQuery({
    queryKey: ['discoms'],
    queryFn: () => expectStatus(api.catalog.listDiscoms(), 200),
    staleTime: 5 * 60_000,
  });
  if (properties.length === 0) return <p className="type-body-sm text-ink-faint">{t('none')}</p>;
  return (
    <ul className="grid gap-4 lg:grid-cols-2">
      {properties.map((property, index) => (
        <motion.li key={property.id} {...listItemEnter(index)}>
          <PropertyCard
            property={property}
            discom={discoms.data?.find((row) => row.id === property.discomId)?.code ?? null}
          />
        </motion.li>
      ))}
    </ul>
  );
}

function PropertyCard({
  property,
  discom,
}: {
  readonly property: Property;
  readonly discom: string | null;
}) {
  const t = useTranslations('customers.property');
  const categoryT = useTranslations('leads.category');
  const canEdit = useCan('customers.manage', 'surveys.perform', 'discom.manage');
  const canQuote = useCan('quotations.create');
  const canChange = useCan('discom.manage', 'customers.manage');
  const [editing, setEditing] = useState(false);
  const [changing, setChanging] = useState(false);
  const place = [property.city, property.district, property.pincode].filter(Boolean).join(', ');
  return (
    <Card className="flex h-full flex-col gap-5 rounded-[28px] p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="type-title-lg font-normal text-ink [font-family:var(--font-display)]">
              {property.label}
            </h3>
            <Badge variant="soft">{categoryT(property.subsidyCategory)}</Badge>
            {property.subsidyClaimed && <Badge variant="energy">{t('subsidyClaimed')}</Badge>}
          </div>
          <p className="flex items-start gap-1.5 type-body-sm text-ink-muted">
            <MapPin aria-hidden className="mt-0.5 size-3.5 shrink-0" />
            <span>
              {property.addressLine}
              <br />
              {place}
            </span>
          </p>
        </div>
        {canEdit && (
          <Button
            variant="quiet"
            size="sm"
            leadingIcon={<PencilLine />}
            onClick={() => setEditing(true)}
          >
            {t('edit')}
          </Button>
        )}
      </div>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-3 border-t border-hairline pt-4 sm:grid-cols-3">
        <Fact label={t('discom')}>{discom ?? '—'}</Fact>
        <Fact label={t('consumerNumber')} mono>
          {property.consumerNumber ?? '—'}
        </Fact>
        <Fact label={t('meterHolder')}>{property.meterHolderName ?? '—'}</Fact>
        <Fact label={t('sanctionedLoad')} mono>
          {property.sanctionedLoadW
            ? formatKwp(property.sanctionedLoadW).replace('kWp', 'kW')
            : '—'}
        </Fact>
        <Fact label={t('phase')}>{property.phase ? t(`phases.${property.phase}`) : '—'}</Fact>
        <Fact label={t('floors')} mono>
          {property.floors}
        </Fact>
        {property.households !== null && (
          <Fact label={t('households')} mono>
            {property.households}
          </Fact>
        )}
      </dl>
      <div className="mt-auto flex flex-wrap gap-2">
        {canQuote && (
          <Button asChild variant="secondary" size="sm" leadingIcon={<FilePlus2 />}>
            <Link href={`/quotations/new?propertyId=${property.id}`}>{t('createQuotation')}</Link>
          </Button>
        )}
        {canChange && (
          <Button
            variant="quiet"
            size="sm"
            leadingIcon={<FileCog />}
            onClick={() => setChanging(true)}
          >
            {t('changeRequest')}
          </Button>
        )}
      </div>
      {canEdit && (
        <EditPropertyDialog property={property} open={editing} onOpenChange={setEditing} />
      )}
      {canChange && (
        <RaiseChangeRequestDialog
          open={changing}
          onOpenChange={setChanging}
          propertyId={property.id}
        />
      )}
    </Card>
  );
}

function Fact({
  label,
  mono,
  children,
}: {
  readonly label: string;
  readonly mono?: boolean;
  readonly children: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <dt className="type-label text-ink-faint">{label}</dt>
      <dd className={`truncate type-body-sm text-ink ${mono ? 'font-mono' : ''}`}>{children}</dd>
    </div>
  );
}
