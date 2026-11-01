'use client';

import type { AmcContract } from '@oneohm/api-contracts';
import { Button, Dialog, type PillTone, StatusPill, useToast } from '@oneohm/design-system/web';
import { formatInr } from '@oneohm/shared';
import { useMutation } from '@tanstack/react-query';
import { useFormatter, useTranslations } from 'next-intl';
import { useState } from 'react';
import { api, expectStatus } from '@/lib/api/api-client';
import { describeError } from '@/lib/api/api-error';
import { useCan } from '@/providers/current-user';
import { dateOf, LONG_DATE, useRefreshAfterSales } from './use-project-after-sales';

const STATE_TONE: Readonly<Record<AmcContract['state'], PillTone>> = {
  upcoming: 'waiting',
  active: 'onTrack',
  ended: 'neutral',
  cancelled: 'neutral',
};

function ContractRow({
  contract,
  onCancel,
}: {
  readonly contract: AmcContract;
  readonly onCancel: (() => void) | null;
}) {
  const t = useTranslations('afterSales.project');
  const format = useFormatter();
  const day = (value: string) => format.dateTime(dateOf(value), LONG_DATE);
  const done = contract.visits.filter((visit) => visit.request?.status === 'resolved').length;
  const next = contract.visits.find((visit) => visit.request?.status !== 'resolved');
  return (
    <li className="flex flex-col gap-2 py-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
      <div className="flex min-w-0 flex-col gap-0.5">
        <p className="flex flex-wrap items-center gap-2">
          <span className="type-body-sm font-medium text-ink">{contract.planName}</span>
          <StatusPill
            size="sm"
            tone={STATE_TONE[contract.state]}
            label={t(`amcState.${contract.state}`)}
          />
        </p>
        <p className="type-label text-ink-muted tabular-nums">
          {t('amcPeriod', {
            from: day(contract.startsOn),
            to: day(contract.endsOn),
            price: formatInr(contract.pricePaise),
          })}
        </p>
        <p className="type-label text-ink-faint">
          {t('visits', { done, total: contract.visits.length })}
          {next && contract.state !== 'cancelled'
            ? ` · ${t('nextVisit', { date: day(next.dueOn) })}`
            : ''}
        </p>
      </div>
      {onCancel && (
        <Button size="sm" variant="quiet" onClick={onCancel}>
          {t('cancel')}
        </Button>
      )}
    </li>
  );
}

/** The project's AMC contracts with their visits, and cancelling one. */
export function AmcList({
  projectId,
  contracts,
}: {
  readonly projectId: string;
  readonly contracts: readonly AmcContract[];
}) {
  const t = useTranslations('afterSales.project');
  const toast = useToast();
  const canSell = useCan('service.manage');
  const refresh = useRefreshAfterSales(projectId);
  const [cancelling, setCancelling] = useState<AmcContract | null>(null);
  const cancel = useMutation({
    mutationFn: (id: string) => expectStatus(api.afterSales.cancelAmc({ params: { id } }), 200),
    onSuccess: async () => {
      setCancelling(null);
      await refresh();
      toast({ tone: 'success', title: t('cancelled') });
    },
    onError: (error) => toast({ tone: 'error', title: describeError(error) }),
  });

  return (
    <section className="flex flex-col gap-1 border-t border-hairline pt-4">
      <h3 className="type-overline text-ink-faint uppercase">{t('amcTitle')}</h3>
      {contracts.length === 0 ? (
        <p className="type-body-sm text-ink-faint">{t('noAmc')}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-hairline">
          {contracts.map((contract) => (
            <ContractRow
              key={contract.id}
              contract={contract}
              onCancel={
                canSell && (contract.state === 'active' || contract.state === 'upcoming')
                  ? () => setCancelling(contract)
                  : null
              }
            />
          ))}
        </ul>
      )}
      <Dialog
        open={cancelling !== null}
        onOpenChange={(open) => !open && setCancelling(null)}
        title={t('cancelTitle')}
        description={t('cancelBody')}
        size="sm"
        footer={
          <>
            <Button variant="quiet" onClick={() => setCancelling(null)}>
              {t('keep')}
            </Button>
            <Button
              variant="danger"
              pending={cancel.isPending}
              onClick={() => cancelling && cancel.mutate(cancelling.id)}
            >
              {t('cancel')}
            </Button>
          </>
        }
      />
    </section>
  );
}
