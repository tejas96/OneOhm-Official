'use client';

import type { LeaveRequestRecord } from '@oneohm/api-contracts';
import { Button, Dialog, listItemEnter, useToast } from '@oneohm/design-system/web';
import { todayIn } from '@oneohm/shared';
import { motion } from 'motion/react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { FormError } from '@/components/form-error';
import { useApiForm } from '@/lib/forms/use-api-form';
import { useWorkforceFormat } from '../workforce-format';
import { LeaveCover, LeaveDecision, LeaveStatus, useLeaveText } from './leave-facts';
import { useCancelLeave } from './use-leave';

/** The signed-in person's own requests, newest first, each cancellable while it can be. */
export function MyLeave({ requests }: { readonly requests: readonly LeaveRequestRecord[] }) {
  const t = useTranslations('team.leave.mine');
  const toast = useToast();
  const format = useWorkforceFormat();
  const { when, length } = useLeaveText();
  const cancel = useCancelLeave();
  const form = useApiForm();
  const [cancelling, setCancelling] = useState<LeaveRequestRecord | null>(null);
  const today = todayIn();
  const sorted = [...requests].sort((a, b) => b.fromDate.localeCompare(a.fromDate));

  if (sorted.length === 0) return <p className="type-body-sm text-ink-faint">{t('none')}</p>;

  const open = (item: LeaveRequestRecord) => {
    form.reset();
    setCancelling(item);
  };
  const confirm = async () => {
    if (!cancelling) return;
    const done = await form.run(() => cancel(cancelling.id));
    if (!done) return;
    toast({ title: t('cancelled'), reference: done.leaveLabel, tone: 'success' });
    setCancelling(null);
  };

  return (
    <>
      <ul className="flex flex-col gap-3">
        {sorted.map((item, index) => {
          const cancellable =
            item.status === 'pending' || (item.status === 'approved' && item.toDate >= today);
          return (
            <motion.li
              key={item.id}
              {...listItemEnter(index)}
              className="flex flex-col gap-3 rounded-lg border border-hairline bg-raised p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="flex min-w-0 flex-col gap-0.5">
                  <p className="type-title-md text-ink">
                    {format.range(item.fromDate, item.toDate)}
                  </p>
                  <p className="type-body-sm text-ink-muted">
                    {item.leaveLabel} · {length(item)}
                  </p>
                </div>
                <LeaveStatus leave={item} />
              </div>
              <LeaveCover leave={item} />
              <LeaveDecision leave={item} />
              {cancellable && (
                <Button
                  size="sm"
                  variant="danger"
                  className="self-start"
                  onClick={() => open(item)}
                >
                  {t('cancel')}
                </Button>
              )}
            </motion.li>
          );
        })}
      </ul>
      <Dialog
        open={cancelling !== null}
        onOpenChange={(next) => !next && setCancelling(null)}
        title={t('confirmTitle')}
        description={cancelling ? `${cancelling.leaveLabel} · ${when(cancelling)}` : undefined}
        size="sm"
        footer={
          <>
            <Button variant="quiet" onClick={() => setCancelling(null)}>
              {t('keep')}
            </Button>
            <Button variant="danger" pending={form.pending} onClick={confirm}>
              {t('confirm')}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3 pb-2">
          <p className="type-body-sm text-ink-muted">{t('confirmBody')}</p>
          <FormError message={form.error} />
        </div>
      </Dialog>
    </>
  );
}
