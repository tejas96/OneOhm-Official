'use client';

import type { StateSubsidyVersion } from '@oneohm/api-contracts';
import { Button, Dialog, useToast } from '@oneohm/design-system/web';
import { useFormatter, useTranslations } from 'next-intl';
import { FormError } from '@/components/form-error';
import { useApiForm } from '@/lib/forms/use-api-form';
import { useStateRuleActions } from './use-state-rules';

/** Withdraws a version that has not started; no quotation has used it yet. */
export function WithdrawStateRuleDialog({
  rule,
  onClose,
}: {
  readonly rule: StateSubsidyVersion | null;
  readonly onClose: () => void;
}) {
  const t = useTranslations('stateSupport.withdrawDialog');
  const format = useFormatter();
  const toast = useToast();
  const form = useApiForm();
  const { withdraw } = useStateRuleActions();

  const confirm = async () => {
    if (!rule) return;
    await form.run(
      async () => {
        await withdraw(rule.id);
        return true;
      },
      () => {
        toast({ title: t('done'), tone: 'success' });
        onClose();
      },
    );
  };

  return (
    <Dialog
      open={rule !== null}
      onOpenChange={(next) => {
        if (!next) {
          form.reset();
          onClose();
        }
      }}
      title={t('title')}
      size="sm"
      footer={
        <>
          <Button variant="quiet" onClick={onClose}>
            {t('cancel')}
          </Button>
          <Button variant="danger" pending={form.pending} onClick={confirm}>
            {t('confirm')}
          </Button>
        </>
      }
    >
      {rule && (
        <div className="flex flex-col gap-4">
          <p className="type-body text-ink-muted">
            {t('body', {
              date: format.dateTime(new Date(rule.validFrom), { dateStyle: 'medium' }),
            })}
          </p>
          <FormError message={form.error} />
        </div>
      )}
    </Dialog>
  );
}
