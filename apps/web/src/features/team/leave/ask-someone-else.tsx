'use client';

import type { LeaveRequestRecord } from '@oneohm/api-contracts';
import { Button, Dialog, Field, Select, useToast } from '@oneohm/design-system/web';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { FormError } from '@/components/form-error';
import { useApiForm } from '@/lib/forms/use-api-form';
import { NONE, useBackupOptions } from './backup-options';
import { useLeaveText } from './leave-facts';
import { useChangeBackup, useLeaveImpact } from './use-leave';

/** Whether this request can ask a different backup: still pending and someone is, or was, named. */
export function canAskSomeoneElse(leave: LeaveRequestRecord) {
  return leave.status === 'pending' && leave.backup !== null;
}

/** The applicant picks another backup (or nobody); the new one is asked. */
export function AskSomeoneElseDialog({
  leave,
  onClose,
}: {
  readonly leave: LeaveRequestRecord | null;
  readonly onClose: () => void;
}) {
  const t = useTranslations('team.leave.ask');
  const toast = useToast();
  const { when } = useLeaveText();
  const changeBackup = useChangeBackup();
  const form = useApiForm();
  const [backup, setBackup] = useState(NONE);
  // Staff come from the people list when this person may read it, else from the suggestions.
  const impact = useLeaveImpact(
    leave
      ? {
          leaveType: leave.leaveType,
          fromDate: leave.fromDate,
          toDate: leave.toDate,
          halfDay: leave.halfDay,
        }
      : null,
  );
  const options = useBackupOptions(leave, impact.data);
  const { reset } = form;

  useEffect(() => {
    if (!leave) return;
    setBackup(NONE);
    reset();
  }, [leave, reset]);

  const submit = async () => {
    if (!leave) return;
    await form.run(
      () => changeBackup(leave.id, backup === NONE ? null : backup),
      () => {
        toast({
          title: t(backup === NONE ? 'cleared' : 'sent'),
          reference: leave.leaveLabel,
          tone: 'success',
        });
        onClose();
      },
    );
  };

  return (
    <Dialog
      open={leave !== null}
      onOpenChange={(open) => !open && onClose()}
      title={t('title')}
      description={leave ? `${leave.leaveLabel} · ${when(leave)}` : undefined}
      size="sm"
      footer={
        <>
          <Button variant="quiet" onClick={onClose}>
            {t('back')}
          </Button>
          <Button variant="primary" pending={form.pending} onClick={submit}>
            {backup === NONE ? t('confirmNone') : t('confirm')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3 pb-2">
        <Field label={t('backup')} hint={t('hint')} error={form.fieldErrors.backupUserId}>
          <Select value={backup} onValueChange={setBackup} options={options} />
        </Field>
        <FormError message={form.error} />
      </div>
    </Dialog>
  );
}
