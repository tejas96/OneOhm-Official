'use client';

import type { PaymentPlan } from '@oneohm/api-contracts';
import { Badge, Button, Card, ShareBar, useToast } from '@oneohm/design-system/web';
import { useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { ListSkeleton, LoadError } from '@/components/query-state';
import { api, expectStatus } from '@/lib/api/api-client';
import { describeError } from '@/lib/api/api-error';
import { BankTransfersCard } from '../payouts/bank-transfers-card';
import { PayoutFeeForm } from '../payouts/payout-fee-form';
import { PlanDialog } from './plan-dialog';
import { PLANS_KEY, usePaymentPlans } from './use-payment-plans';

const SEGMENT_COLORS = [
  'bg-accent',
  'bg-on-track-solid',
  'bg-waiting-solid',
  'bg-ink-faint',
] as const;

/** Payment terms new projects use (PRD 3.7, 7.2): the default plan and any others. */
export function PaymentPlansPanel() {
  const t = useTranslations('settings.paymentPlans');
  const toast = useToast();
  const client = useQueryClient();
  const plans = usePaymentPlans();
  const [editing, setEditing] = useState<PaymentPlan | 'new' | null>(null);
  const makeDefault = async (plan: PaymentPlan) => {
    try {
      const next = await expectStatus(
        api.paymentPlans.makeDefault({ params: { id: plan.id } }),
        200,
      );
      client.setQueryData(PLANS_KEY, next);
      toast({ title: t('nowDefault', { name: plan.name }), tone: 'success' });
    } catch (error) {
      toast({ title: describeError(error), tone: 'error' });
    }
  };
  return (
    <section className="flex flex-col gap-5">
      <div className="grid gap-4 lg:grid-cols-2">
        <BankTransfersCard />
        <PayoutFeeForm />
      </div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex max-w-2xl flex-col gap-1">
          <h2 className="type-display-md text-ink">{t('title')}</h2>
          <p className="type-body text-ink-muted">{t('intro')}</p>
        </div>
        <Button variant="secondary" leadingIcon={<Plus />} onClick={() => setEditing('new')}>
          {t('add')}
        </Button>
      </div>
      {plans.isPending && <ListSkeleton label={t('loading')} rows={3} />}
      {plans.isError && <LoadError error={plans.error} onRetry={() => plans.refetch()} />}
      <div className="grid gap-4 md:grid-cols-2">
        {plans.data?.map((plan) => (
          <Card key={plan.id} className="flex flex-col gap-4 p-5">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <h3 className="type-title-md text-ink">{plan.name}</h3>
              <span className="flex gap-1.5">
                {plan.isDefault && <Badge variant="soft">{t('default')}</Badge>}
                {!plan.active && <Badge variant="outline">{t('off')}</Badge>}
              </span>
            </div>
            <ShareBar
              label={plan.name}
              legend="none"
              segments={plan.steps.map((step, index) => ({
                key: step.key,
                label: step.label,
                value: step.shareBp,
                colorClassName: SEGMENT_COLORS[index % SEGMENT_COLORS.length] ?? 'bg-accent',
              }))}
            />
            <ol className="flex flex-col gap-1.5">
              {plan.steps.map((step) => (
                <li
                  key={step.key}
                  className="flex items-baseline justify-between gap-3 type-body-sm"
                >
                  <span className="text-ink">
                    {step.label}
                    <span className="text-ink-faint"> · {t(`triggers.${step.trigger}`)}</span>
                  </span>
                  <span className="font-mono text-ink tabular-nums">{step.shareBp / 100}%</span>
                </li>
              ))}
            </ol>
            <div className="mt-auto flex flex-wrap gap-2 border-t border-hairline pt-3">
              <Button size="sm" variant="secondary" onClick={() => setEditing(plan)}>
                {t('edit')}
              </Button>
              {!plan.isDefault && (
                <Button size="sm" variant="quiet" onClick={() => makeDefault(plan)}>
                  {t('makeDefault')}
                </Button>
              )}
            </div>
          </Card>
        ))}
      </div>
      <PlanDialog
        open={editing !== null}
        plan={editing === 'new' ? null : editing}
        onClose={() => setEditing(null)}
      />
    </section>
  );
}
