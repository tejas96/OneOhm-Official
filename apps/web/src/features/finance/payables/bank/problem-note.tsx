'use client';

import type { PayoutOptions } from '@oneohm/api-contracts';
import { Button } from '@oneohm/design-system/web';
import Link from 'next/link';
import { useFormatter, useTranslations } from 'next-intl';
import { AddBankDetails } from './add-bank-details';
import { payeeHref } from './payee-link';

const NOTE = 'flex flex-col gap-2 rounded-md bg-sunken px-3 py-2.5 type-body-sm text-ink-muted';

/** Why this bill cannot go by bank right now: a calm note with one next step. */
export function ProblemNote({ data }: { readonly data: PayoutOptions }) {
  const t = useTranslations('finance.payables.bank');
  const format = useFormatter();
  const { problem, payee } = data;
  if (problem === null) return null;

  if ((problem === 'no_bank_details' || problem === 'bad_bank_details') && payee)
    return (
      <div className="flex flex-col gap-3">
        <p role="status" className={NOTE}>
          {data.problemText ?? t(`problem.${problem}`)}
        </p>
        <AddBankDetails payee={payee} />
      </div>
    );

  if (problem === 'bank_on_hold' && data.hold) {
    const stamp = { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' } as const;
    const ends = new Date(data.hold.until);
    const until = format.dateTime(ends, stamp);
    // The hold lasts 24 hours from the change.
    const changed = format.dateTime(new Date(ends.getTime() - 24 * 3_600_000), stamp);
    return (
      <div role="status" className={NOTE}>
        <span>
          {data.hold.changedByName
            ? t('hold.byWho', { who: data.hold.changedByName, changed, until })
            : t('hold.noName', { changed, until })}
        </span>
        {payee && (
          <Button variant="secondary" size="sm" className="self-start" asChild>
            <Link href={payeeHref(payee)}>{t('hold.open')}</Link>
          </Button>
        )}
      </div>
    );
  }

  return (
    <p role="status" className={NOTE}>
      {data.problemText ?? t(`problem.${problem}`)}
    </p>
  );
}
