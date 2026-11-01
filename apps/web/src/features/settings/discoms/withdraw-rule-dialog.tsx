'use client';

import type { SubsidyRuleVersion } from '@oneohm/api-contracts';
import { Button, Dialog, useToast } from '@oneohm/design-system/web';
import { useFormatter, useTranslations } from 'next-intl';
import { FormError } from '@/components/form-error';
import { useApiForm } from '@/lib/forms/use-api-form';
import { useSubsidyRuleActions } from './use-subsidy-rules';

/** Withdraws a version that has not started; nothing has priced with it yet. */
export function WithdrawRuleDialog({
  rule,
  onClose,
}: {
  readonly rule: SubsidyRuleVersion | null;
  readonly onClose: () => void;
}) {
  const t = useTranslations('settings.subsidy');
  const format = useFormatter();
  const toast = useToast();
  const form = useApiForm();
  const { withdraw } = useSubsidyRuleActions();

  const confirm = async () => {
    if (!rule) return;
    const done = await form.run(async () => {
      await withdraw(rule.id);
      return true;
    });
    if (!done) return;
    toast({ title: t('withdrawDialog.done'), tone: 'success' });
    onClose();
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
      title={t('withdrawDialog.title')}
      size="sm"
      footer={
        <>
          <Button variant="quiet" onClick={onClose}>
            {t('withdrawDialog.cancel')}
          </Button>
          <Button variant="danger" pending={form.pending} onClick={confirm}>
            {t('withdrawDialog.confirm')}
          </Button>
        </>
      }
    >
      {rule && (
        <div className="flex flex-col gap-4">
          <p className="type-body text-ink-muted">
            {t('withdrawDialog.body', {
              category: t(`categories.${rule.category}`),
              date: format.dateTime(new Date(rule.validFrom), { dateStyle: 'medium' }),
            })}
          </p>
          <FormError message={form.error} />
        </div>
      )}
    </Dialog>
  );
}
