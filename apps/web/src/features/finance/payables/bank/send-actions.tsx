'use client';

import type { PayoutOptions } from '@oneohm/api-contracts';
import { Button } from '@oneohm/design-system/web';
import { Landmark } from 'lucide-react';
import { useTranslations } from 'next-intl';

/** The one button this person gets: Pay (to a confirm step), Ask to send, or a plain note why not. */
export function SendActions({
  data,
  payLabel,
  asking,
  blocked,
  onPay,
  onAsk,
}: {
  readonly data: PayoutOptions;
  readonly payLabel: string;
  readonly asking: boolean;
  /** The amount is not right yet: the button waits until it is. */
  readonly blocked: boolean;
  readonly onPay: () => void;
  readonly onAsk: () => void;
}) {
  const t = useTranslations('finance.payables.bank');
  const note = 'rounded-md bg-sunken px-3 py-2.5 type-body-sm text-ink-muted';
  if (data.canSend) {
    if (data.secondPerson.needed && !data.secondPerson.met)
      return (
        <p role="status" className={note}>
          {data.secondPerson.text ?? data.problemText ?? t('secondPerson')}
        </p>
      );
    return (
      <Button variant="primary" leadingIcon={<Landmark />} disabled={blocked} onClick={onPay}>
        {payLabel}
      </Button>
    );
  }
  if (data.request !== null) return null;
  if (data.canAsk)
    return (
      <Button variant="primary" pending={asking} disabled={blocked} onClick={onAsk}>
        {t('ask.button')}
      </Button>
    );
  return <p className="type-body-sm text-ink-faint">{t('needsApprover')}</p>;
}
