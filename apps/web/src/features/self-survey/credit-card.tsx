'use client';

import { Button, Card, CardHeader, Field, Input } from '@oneohm/design-system/web';
import { formatInr } from '@oneohm/shared';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useCan } from '@/providers/current-user';
import { useSettleCredit, useSurveyCredits } from './use-self-survey';

/** The project's self-survey discount: where it went, or, when no payment could take it, the hand settlement. */
export function SurveyCreditCard({ projectId }: { readonly projectId: string }) {
  const t = useTranslations('selfSurvey.credit');
  const allowed = useCan('finance.record_payments', 'projects.manage');
  const canSettle = useCan('finance.record_payments');
  const query = useSurveyCredits(projectId, allowed);
  const settle = useSettleCredit(projectId);
  const [reason, setReason] = useState('');
  const credits = (query.data ?? []).filter((one) => one.status !== 'reversed');
  if (!allowed || credits.length === 0) return null;
  return (
    <Card>
      <CardHeader title={t('title')} />
      <ul className="flex flex-col gap-3 border-t border-hairline px-5 py-4">
        {credits.map((credit) => {
          const amount = formatInr(credit.amountPaise);
          return (
            <li key={credit.id} className="flex flex-col gap-2 type-body-sm text-ink">
              {credit.status === 'pending' && t('pending', { amount })}
              {credit.status === 'applied' &&
                t('applied', { amount, payment: credit.milestoneLabel ?? '' })}
              {credit.status === 'paid_out' &&
                t('paid_out', { amount, note: credit.settleNote ?? '' })}
              {credit.status === 'pending' && canSettle && (
                <div className="flex flex-wrap items-end gap-2">
                  <Field label={t('reason')} className="min-w-64 flex-1">
                    <Input value={reason} onChange={(event) => setReason(event.target.value)} />
                  </Field>
                  <Button
                    variant="secondary"
                    disabled={reason.trim().length < 3}
                    pending={settle.isPending}
                    onClick={() => settle.mutate({ id: credit.id, reason })}
                  >
                    {t('save')}
                  </Button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
