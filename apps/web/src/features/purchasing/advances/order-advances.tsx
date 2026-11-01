'use client';

import type { PurchaseOrderDetail } from '@oneohm/api-contracts';
import { Button } from '@oneohm/design-system/web';
import { formatInr } from '@oneohm/shared';
import { HandCoins } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useCan } from '@/providers/current-user';
import { useAdvances } from '../use-purchasing';
import { AdvanceStatusPill } from './advance-status';
import { RecordAdvanceDialog } from './record-advance-dialog';

/** Advances against one purchase order, on the order itself; finance can record one. */
export function OrderAdvances({ order }: { readonly order: PurchaseOrderDetail }) {
  const t = useTranslations('purchasing.advances.onOrder');
  const canSee = useCan(
    'finance.view',
    'finance.record_payments',
    'finance.approve_payments',
    'procurement.manage',
  );
  const canRecord = useCan('finance.record_payments');
  const [recording, setRecording] = useState(false);
  const advances = useAdvances('all', order.id, canSee);
  const live = (advances.data ?? []).filter((row) => row.status !== 'cancelled');
  const advanceable = order.status === 'sent' || order.status === 'partly_received';
  if (!canSee || (live.length === 0 && !(canRecord && advanceable))) return null;

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="type-overline text-ink-faint uppercase">{t('title')}</h3>
        {canRecord && advanceable && (
          <Button
            size="sm"
            variant="secondary"
            leadingIcon={<HandCoins />}
            onClick={() => setRecording(true)}
          >
            {t('record')}
          </Button>
        )}
      </div>
      {live.length === 0 ? (
        <p className="type-body-sm text-ink-muted">{t('none')}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-hairline border-y border-hairline">
          {live.map((advance) => (
            <li key={advance.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <span className="flex flex-wrap items-center gap-2">
                <Link
                  href="/finance?tab=advances"
                  className="font-mono type-body-sm text-ink hover:text-accent"
                >
                  {advance.number}
                </Link>
                <AdvanceStatusPill advance={advance} />
              </span>
              <span className="flex flex-col items-end">
                <span className="tabular-nums text-ink">{formatInr(advance.amountPaise)}</span>
                {advance.adjustedPaise > 0 && (
                  <span className="type-label text-ink-faint">
                    {t('adjusted', { amount: formatInr(advance.adjustedPaise) })}
                  </span>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
      <RecordAdvanceDialog
        open={recording}
        orderId={order.id}
        onClose={() => setRecording(false)}
      />
    </section>
  );
}
