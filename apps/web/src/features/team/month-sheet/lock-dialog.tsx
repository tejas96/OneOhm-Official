'use client';

import type { MonthSheet } from '@oneohm/api-contracts';
import { Button, Dialog, useToast } from '@oneohm/design-system/web';
import { TriangleAlert } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { FormError } from '@/components/form-error';
import { useApiForm } from '@/lib/forms/use-api-form';
import { useMonthFormat } from './month-format';
import { useMonthActions } from './use-month-sheet';

/**
 * Locking freezes every row. Rows that still need a look do not stop it, but they are named
 * here first, each with what is open, so nobody locks past a problem without seeing it.
 */
export function LockDialog({
  open,
  sheet,
  onClose,
}: {
  readonly open: boolean;
  readonly sheet: MonthSheet;
  readonly onClose: () => void;
}) {
  const t = useTranslations('team.monthSheet.lock');
  const flagT = useTranslations('team.monthSheet.flags');
  const toast = useToast();
  const form = useApiForm();
  const { lock } = useMonthActions();
  const words = useMonthFormat();
  const name = words.monthName(sheet.month);
  const amber = sheet.rows.filter((row) => row.amber);

  const confirm = () =>
    form.run(
      () => lock(sheet.month),
      () => {
        toast({ title: t('done', { month: name }), description: t('doneBody'), tone: 'success' });
        onClose();
      },
    );

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          form.reset();
          onClose();
        }
      }}
      title={t('title', { month: name })}
      description={t('body', { count: sheet.summary.people })}
      footer={
        <>
          <Button variant="quiet" onClick={onClose}>
            {t('cancel')}
          </Button>
          <Button variant="primary" pending={form.pending} onClick={confirm}>
            {t('confirm', { month: name })}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4 pb-2">
        {amber.length > 0 && (
          <div className="flex flex-col gap-2 rounded-lg bg-at-risk-tint px-3.5 py-3">
            <p className="flex items-start gap-2 type-body font-medium text-at-risk">
              <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
              {t('warning', { count: amber.length })}
            </p>
            <ul className="flex max-h-56 flex-col gap-1 overflow-y-auto">
              {amber.map((row) => (
                <li key={row.person.id} className="type-body-sm text-ink">
                  <span className="font-medium">{row.person.fullName}</span>
                  {' — '}
                  {row.flags.map((flag) => flagT(`${flag.kind}.title`)).join(', ')}
                </li>
              ))}
            </ul>
            <p className="type-body-sm text-ink-muted">{t('warningHint')}</p>
          </div>
        )}
        <p className="type-body-sm text-ink-muted">{t('notify')}</p>
        <FormError message={form.error} />
      </div>
    </Dialog>
  );
}
