'use client';

import { Button, Dialog, useToast } from '@oneohm/design-system/web';
import { useMutation } from '@tanstack/react-query';
import { Clock, Info } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { useState } from 'react';
import { FormError } from '@/components/form-error';
import { api, expectStatus } from '@/lib/api/api-client';
import { describeError } from '@/lib/api/api-error';
import { holdActive } from './bank-hold';

/** The hold after a payee's bank details changed (same shape as the pay dialog's `hold`). */
export interface BankHoldView {
  readonly until: string;
  readonly changedByName: string | null;
  readonly changedAt?: string | null;
  /** The viewer approves payments and did not make the change. */
  readonly canRelease: boolean;
}

/**
 * A calm note on a vendor or contractor page while bank transfers wait after a bank
 * change (spec decision 2, U5). A second approver may release it early, after a phone check.
 */
export function BankHoldNote({
  kind,
  id,
  payeeName,
  hold,
  isNew = false,
  onReleased,
}: {
  readonly kind: 'vendor' | 'contractor';
  readonly id: string;
  readonly payeeName: string;
  readonly hold: BankHoldView | null;
  /** First entered recently and nothing paid by bank yet: a calm "check the name" note. */
  readonly isNew?: boolean;
  /** Refetch the page's data once the hold is released. */
  readonly onReleased: () => void;
}) {
  const t = useTranslations('inventory.bankHold');
  const format = useFormatter();
  const toast = useToast();
  const [asking, setAsking] = useState(false);
  const release = useMutation({
    mutationFn: () => expectStatus(api.bankPayouts.releaseBankHold({ params: { kind, id } }), 204),
    onSuccess: () => {
      setAsking(false);
      toast({ title: t('released'), tone: 'success' });
      onReleased();
    },
  });
  if (!hold || !holdActive(hold)) {
    if (!isNew) return null;
    return (
      <p className="flex items-start gap-2 rounded-md bg-sunken px-4 py-3 type-body-sm text-ink-muted">
        <Info aria-hidden className="mt-0.5 size-4 shrink-0" />
        <span>{t('newAccount')}</span>
      </p>
    );
  }
  const when = (iso: string, withDate: boolean) =>
    format.dateTime(new Date(iso), {
      ...(withDate ? { day: 'numeric', month: 'short' } : {}),
      hour: 'numeric',
      minute: '2-digit',
    });
  const until = when(hold.until, true);
  const who = hold.changedByName ?? t('someone');
  return (
    <div className="flex flex-col gap-3 rounded-md bg-sunken px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="flex items-start gap-2 type-body-sm text-ink-muted">
        <Clock aria-hidden className="mt-0.5 size-4 shrink-0" />
        <span>
          {hold.changedAt
            ? t('note', {
                date: format.dateTime(new Date(hold.changedAt), { day: 'numeric', month: 'short' }),
                name: who,
                until,
              })
            : t('noteNoDate', { name: who, until })}
        </span>
      </p>
      {hold.canRelease && (
        <>
          <Button variant="secondary" size="sm" onClick={() => setAsking(true)}>
            {t('release')}
          </Button>
          <Dialog
            open={asking}
            onOpenChange={(open) => {
              setAsking(open);
              if (!open) release.reset();
            }}
            title={t('confirmTitle')}
            description={t('confirm', { name: payeeName })}
            size="sm"
            footer={
              <>
                <Button variant="quiet" onClick={() => setAsking(false)}>
                  {t('keepHold')}
                </Button>
                <Button
                  variant="primary"
                  pending={release.isPending}
                  onClick={() => release.mutate()}
                >
                  {t('release')}
                </Button>
              </>
            }
          >
            <FormError message={release.isError ? describeError(release.error) : null} />
          </Dialog>
        </>
      )}
    </div>
  );
}
