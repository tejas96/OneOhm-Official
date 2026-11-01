'use client';

import type { ContractorDetail, ContractorRate } from '@oneohm/api-contracts';
import { Button, cn, Switch, useToast } from '@oneohm/design-system/web';
import { DEFAULT_TASK_LIBRARY } from '@oneohm/domain';
import { formatInr } from '@oneohm/shared';
import { Plus, ReceiptIndianRupee } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { api, expectStatus } from '@/lib/api/api-client';
import { describeError } from '@/lib/api/api-error';
import { AddRateDialog } from './add-rate-dialog';
import { useRefreshContractors } from './use-contractors';

export const taskTitle = (key: string | null) =>
  DEFAULT_TASK_LIBRARY.find((task) => task.key === key)?.title ?? key ?? '';

/** How this contractor is paid: per kWp, per job, per day or per task. */
export function ContractorRatesCard({ contractor }: { readonly contractor: ContractorDetail }) {
  const t = useTranslations('contractors.rates');
  const toast = useToast();
  const refresh = useRefreshContractors();
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const toggle = async (rate: ContractorRate) => {
    setBusy(rate.id);
    try {
      await expectStatus(
        api.contractors.updateContractorRate({
          params: { id: rate.id },
          body: { active: !rate.active },
        }),
        200,
      );
      await refresh();
    } catch (error) {
      toast({ tone: 'error', title: t('failed'), description: describeError(error) });
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="flex flex-col gap-4 rounded-[28px] bg-raised p-6 shadow-e1 ring-1 ring-hairline/70">
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 type-title-md text-ink">
          <ReceiptIndianRupee aria-hidden className="size-4 text-ink-faint" />
          {t('title')}
        </h2>
        <Button size="sm" variant="quiet" leadingIcon={<Plus />} onClick={() => setAdding(true)}>
          {t('add')}
        </Button>
      </div>
      {contractor.rates.length === 0 ? (
        <p className="type-body-sm text-ink-muted">{t('empty')}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-hairline">
          {contractor.rates.map((rate) => (
            <li
              key={rate.id}
              className={cn('flex items-center gap-3 py-3', !rate.active && 'opacity-55')}
            >
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="truncate type-body-sm font-medium text-ink">{rate.label}</span>
                <span className="truncate type-label text-ink-faint">
                  {t(`basis.${rate.basis}`)}
                  {rate.taskKey && ` · ${taskTitle(rate.taskKey)}`}
                  {rate.projectType && ` · ${t(`types.${rate.projectType}`)}`}
                </span>
              </span>
              <span className="type-body-sm text-ink tabular-nums">
                {formatInr(rate.amountPaise)}
                <span className="text-ink-faint">{t(`unit.${rate.basis}`)}</span>
              </span>
              <Switch
                label={<span className="sr-only">{t('activeFor', { label: rate.label })}</span>}
                className="min-h-0"
                checked={rate.active}
                disabled={busy === rate.id}
                onCheckedChange={() => toggle(rate)}
              />
            </li>
          ))}
        </ul>
      )}
      <AddRateDialog contractor={contractor} open={adding} onOpenChange={setAdding} />
    </section>
  );
}
