'use client';

import type { BankPayout } from '@oneohm/api-contracts';
import { Badge, Button } from '@oneohm/design-system/web';
import { useTranslations } from 'next-intl';
import { FormError } from '@/components/form-error';
import { describeError } from '@/lib/api/api-error';
import { payoutIsOpen } from './payout-status';
import { usePracticePayout } from './use-payouts';

type Outcome = 'processed' | 'failed' | 'reversed';

/** Practice mode only: finish a practice payout so the owner can see every ending. */
export function PracticeButtons({ payout }: { readonly payout: BankPayout }) {
  const t = useTranslations('finance.payables.bank.practice');
  const practice = usePracticePayout();
  const options: readonly (readonly [Outcome, 'primary' | 'secondary'])[] = payoutIsOpen(payout)
    ? [
        ['processed', 'secondary'],
        ['failed', 'secondary'],
      ]
    : payout.phase === 'paid'
      ? [['reversed', 'secondary']]
      : [];
  if (options.length === 0) return null;
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-dashed border-hairline p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="soft">{t('badge')}</Badge>
        <span className="type-label text-ink-faint">{t('hint')}</span>
      </div>
      <div className="flex flex-wrap gap-2">
        {options.map(([outcome, variant]) => (
          <Button
            key={outcome}
            size="sm"
            variant={variant}
            disabled={practice.isPending}
            pending={practice.isPending && practice.variables?.outcome === outcome}
            onClick={() => practice.mutate({ payout, outcome })}
          >
            {t(outcome)}
          </Button>
        ))}
      </div>
      <FormError message={practice.isError ? describeError(practice.error) : null} />
    </div>
  );
}
