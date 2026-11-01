'use client';

import {
  Avatar,
  Badge,
  Button,
  pageEnter,
  Skeleton,
  SkeletonGroup,
} from '@oneohm/design-system/web';
import { formatInrCompact, formatKwp } from '@oneohm/shared';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Mail, MessageCircle, Phone } from 'lucide-react';
import { motion } from 'motion/react';
import Link from 'next/link';
import { useFormatter, useTranslations } from 'next-intl';
import { LoadError } from '@/components/query-state';
import { api, expectStatus } from '@/lib/api/api-client';
import { formatPhone, swatchFor, whatsappHref } from '@/lib/format/contact';
import { CustomerTabs } from './customer-tabs';

/**
 * The customer 360 (PRD 3.2): who they are on top, then their sites and projects, money,
 * conversations, service and documents in tabs (`?tab=`).
 */
export function CustomerDetailView({ id }: { readonly id: string }) {
  const t = useTranslations('customers');
  const format = useFormatter();
  const query = useQuery({
    queryKey: ['customers', 'detail', id],
    queryFn: () => expectStatus(api.crm.getCustomer({ params: { id } }), 200),
  });

  if (query.isPending) {
    return (
      <SkeletonGroup
        label={t('loading')}
        className="mx-auto flex w-full max-w-[90rem] flex-col gap-6"
      >
        <Skeleton className="h-28 w-1/2 rounded-2xl" />
        <Skeleton className="h-64 rounded-[28px]" />
      </SkeletonGroup>
    );
  }
  if (query.isError) return <LoadError error={query.error} onRetry={() => query.refetch()} />;
  const customer = query.data;
  const accepted = customer.quotations.filter((quotation) => quotation.status === 'accepted');
  const installedWp = customer.projects.reduce((sum, project) => sum + project.capacityWp, 0);

  return (
    <motion.div {...pageEnter} className="mx-auto flex w-full max-w-[90rem] flex-col gap-10">
      <header className="flex flex-col gap-5">
        <Link
          href="/customers"
          className="inline-flex items-center gap-1.5 self-start type-body-sm text-ink-muted hover:text-ink"
        >
          <ArrowLeft aria-hidden className="size-4" />
          {t('back')}
        </Link>
        <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
          <div className="flex min-w-0 items-center gap-4">
            <Avatar name={customer.name} swatch={swatchFor(customer.id)} size="lg" />
            <div className="flex min-w-0 flex-col gap-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="soft">{t(`kind.${customer.kind}`)}</Badge>
                <span className="font-mono text-[0.75rem] text-ink-faint uppercase">
                  {t('since', {
                    date: format.dateTime(new Date(customer.createdAt), {
                      month: 'short',
                      year: 'numeric',
                    }),
                  })}
                </span>
              </div>
              <h1 className="type-display-lg text-balance text-ink md:type-display-xl">
                {customer.name}
              </h1>
              <p className="flex flex-wrap gap-x-3 type-body text-ink-muted">
                <span className="font-mono">{formatPhone(customer.phone)}</span>
                {customer.email && (
                  <>
                    <span aria-hidden>·</span>
                    <span>{customer.email}</span>
                  </>
                )}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="secondary" size="sm" leadingIcon={<Phone />}>
              <a href={`tel:${customer.phone}`}>{t('call')}</a>
            </Button>
            <Button asChild variant="secondary" size="sm" leadingIcon={<MessageCircle />}>
              <a href={whatsappHref(customer.phone)} target="_blank" rel="noreferrer">
                {t('whatsapp')}
              </a>
            </Button>
            {customer.email && (
              <Button asChild variant="secondary" size="sm" leadingIcon={<Mail />}>
                <a href={`mailto:${customer.email}`}>{t('email')}</a>
              </Button>
            )}
          </div>
        </div>
        <dl className="grid grid-cols-2 gap-x-10 gap-y-4 border-y border-hairline py-5 sm:grid-cols-4">
          <Figure label={t('figures.sites')} value={String(customer.properties.length)} />
          <Figure label={t('figures.quotations')} value={String(customer.quotations.length)} />
          <Figure
            label={t('figures.accepted')}
            value={
              accepted.length
                ? formatInrCompact(accepted.reduce((sum, row) => sum + row.totalPaise, 0))
                : '—'
            }
          />
          <Figure
            label={t('figures.capacity')}
            value={installedWp ? formatKwp(installedWp) : '—'}
          />
        </dl>
      </header>
      <CustomerTabs customer={customer} />
    </motion.div>
  );
}

function Figure({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="type-label text-ink-faint">{label}</dt>
      <dd className="type-display-md text-ink tabular-nums">{value}</dd>
    </div>
  );
}
