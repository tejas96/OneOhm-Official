'use client';

import type { ChangeRequestDetail } from '@oneohm/api-contracts';
import {
  Button,
  Card,
  CardHeader,
  pageEnter,
  Skeleton,
  SkeletonGroup,
  StatusPill,
} from '@oneohm/design-system/web';
import { ArrowLeft, Ban } from 'lucide-react';
import { motion } from 'motion/react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { LoadError } from '@/components/query-state';
import { useCan } from '@/providers/current-user';
import { ChangeRequestSteps } from './change-request-steps';
import { REQUEST_TONE } from './change-requests-list';
import { CancelRequestDialog } from './step-dialogs';
import { useChangeRequest } from './use-discom';

/** One change request: what changes, the DISCOM steps, and what was applied. */
export function ChangeRequestView({ id }: { readonly id: string }) {
  const t = useTranslations('discom.request');
  const statusT = useTranslations('discom.requests.status');
  const canManage = useCan('discom.manage');
  const query = useChangeRequest(id);
  const [cancelling, setCancelling] = useState(false);

  if (query.isPending)
    return (
      <SkeletonGroup
        label={t('loading')}
        className="mx-auto flex w-full max-w-[90rem] flex-col gap-6"
      >
        <Skeleton className="h-28 w-1/2 rounded-2xl" />
        <Skeleton className="h-72 rounded-[28px]" />
      </SkeletonGroup>
    );
  if (query.isError) return <LoadError error={query.error} onRetry={() => query.refetch()} />;
  const request = query.data;

  return (
    <motion.div {...pageEnter} className="mx-auto flex w-full max-w-[90rem] flex-col gap-8 py-2">
      <Link
        href="/discom"
        className="inline-flex w-fit items-center gap-1.5 type-body-sm text-ink-muted hover:text-ink"
      >
        <ArrowLeft aria-hidden className="size-4" />
        {t('back')}
      </Link>
      <header className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex flex-col gap-2">
          <p className="flex flex-wrap items-center gap-3 font-mono text-[0.75rem] text-ink-faint">
            {request.number}
            {request.referenceNumber && <span>· {request.referenceNumber}</span>}
            <StatusPill
              size="sm"
              tone={REQUEST_TONE[request.status]}
              label={statusT(request.status)}
            />
          </p>
          <h1 className="type-display-lg text-balance text-ink">{request.title}</h1>
          <p className="type-body text-ink-muted">
            <Link href={`/customers/${request.customer.id}`} className="text-ink hover:text-accent">
              {request.customer.name}
            </Link>
            {` · ${request.property.label}, ${request.property.city}`}
            {request.discomCode && ` · ${request.discomCode}`}
            {request.project && (
              <>
                {' · '}
                <Link
                  href={`/projects/${request.project.id}`}
                  className="text-ink hover:text-accent"
                >
                  {request.project.code}
                </Link>
              </>
            )}
          </p>
          {request.cancelledReason && (
            <p className="type-body-sm text-overdue">
              {t('cancelled', { reason: request.cancelledReason })}
            </p>
          )}
        </div>
        {canManage && request.status === 'open' && (
          <Button variant="quiet" leadingIcon={<Ban />} onClick={() => setCancelling(true)}>
            {t('cancel')}
          </Button>
        )}
      </header>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="lg:col-span-7">
          <ChangeRequestSteps request={request} />
        </div>
        <div className="flex flex-col gap-6 lg:col-span-5">
          <ChangeCard request={request} />
          {request.project && <ImpactCard request={request} />}
        </div>
      </div>
      {cancelling && <CancelRequestDialog request={request} onClose={() => setCancelling(false)} />}
    </motion.div>
  );
}

function ChangeCard({ request }: { readonly request: ChangeRequestDetail }) {
  const t = useTranslations('discom.request');
  const fieldT = useTranslations('discom.fields');
  const show = (key: string, value: unknown) => {
    if (value === null || value === undefined || value === '') return '—';
    if (key === 'sanctionedLoadW') return `${Number(value) / 1000} kW`;
    if (key === 'phase' || key === 'subsidyCategory') return fieldT(`options.${String(value)}`);
    return String(value);
  };
  const applied = request.appliedValues ?? {};
  return (
    <Card className="flex flex-col overflow-hidden">
      <CardHeader title={t('change')} description={request.note ?? undefined} />
      <dl className="flex flex-col border-t border-hairline px-5 py-3">
        {Object.entries(request.values).map(([key, value]) => (
          <div key={key} className="flex items-baseline gap-3 py-2">
            <dt className="type-body-sm text-ink-muted">{fieldT(key)}</dt>
            <span aria-hidden className="flex-1 border-b border-dotted border-rule" />
            <dd className="type-body-sm text-ink">{show(key, value)}</dd>
          </div>
        ))}
      </dl>
      {Object.keys(applied).length > 0 && (
        <div className="flex flex-col gap-2 border-t border-hairline bg-on-track-tint/40 px-5 py-4">
          <p className="type-overline text-on-track uppercase">{t('applied')}</p>
          {Object.entries(applied).map(([key, value]) => (
            <p key={key} className="type-body-sm text-ink">
              {fieldT(`site.${key}`)}:{' '}
              <span className="text-ink-faint line-through">
                {show(key, request.previousValues?.[key])}
              </span>
              {' → '}
              <span className="font-medium">{show(key, value)}</span>
            </p>
          ))}
        </div>
      )}
    </Card>
  );
}

function ImpactCard({ request }: { readonly request: ChangeRequestDetail }) {
  const t = useTranslations('discom.request');
  const stageT = useTranslations('stages');
  const held = [
    ...request.blocks.stages.map((stage) => stageT(stage)),
    ...(request.blocks.taskTitles ??
      request.blocks.taskKeys.map(() => t('netMeteringApplication'))),
  ];
  return (
    <section className="flex flex-col gap-2 rounded-[28px] bg-raised p-6 shadow-e1 ring-1 ring-hairline/70">
      <h2 className="type-title-md text-ink">{t('impact')}</h2>
      <p className="type-body-sm text-ink-muted">
        {held.length === 0
          ? t('noImpact')
          : request.status === 'open'
            ? t('holding', { work: held.join(', ') })
            : t('released', { work: held.join(', ') })}
      </p>
    </section>
  );
}
