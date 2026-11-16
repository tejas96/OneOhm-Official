'use client';

import type { MonthSheetPerson } from '@oneohm/api-contracts';
import { Button, Dialog, useToast } from '@oneohm/design-system/web';
import { formatInr } from '@oneohm/shared';
import { ArrowRight, Plus, RefreshCw } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { FormError } from '@/components/form-error';
import { useApiForm } from '@/lib/forms/use-api-form';
import { useMonthFormat } from './month-format';
import { dayCount } from './month-math';
import { useMonthActions } from './use-month-sheet';

const MONEY = new Set(['grossPaise', 'travelApprovedPaise', 'bonusPaise']);

const shown = (field: string, value: number | null) =>
  value === null ? '—' : MONEY.has(field) ? formatInr(value) : dayCount(value);

/**
 * A locked row whose facts moved since: each number before and after, in words, and for the one
 * who locks it, a button that freezes the row again from today's facts. For someone who
 * qualifies now but is not in the locked sheet, the same card offers to add their row.
 */
export function DiffCard({ person }: { readonly person: MonthSheetPerson }) {
  const adding = !person.row.inLock;
  const t = useTranslations(adding ? 'team.monthSheet.addRow' : 'team.monthSheet.diff');
  const fields = useTranslations('team.monthSheet.diff');
  const toast = useToast();
  const form = useApiForm();
  const words = useMonthFormat();
  const { refreshRow } = useMonthActions();
  const [asking, setAsking] = useState(false);
  const { row } = person;
  const close = () => {
    setAsking(false);
    form.reset();
  };

  const confirm = () =>
    form.run(
      () => refreshRow(person.lock.month, row.person.id),
      () => {
        toast({ title: t('done'), reference: row.person.fullName, tone: 'success' });
        close();
      },
    );

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-review-solid/40 bg-review-tint px-3.5 py-3">
      <div className="flex flex-col gap-0.5">
        <p className="type-body font-medium text-review">{t('title')}</p>
        <p className="type-body-sm text-ink-muted">
          {adding
            ? t('body', { name: row.person.fullName, month: words.month(person.lock.month) })
            : row.frozenAt
              ? t('body', { date: words.moment(row.frozenAt) })
              : t('bodyNoDate')}
        </p>
      </div>
      <ul className="flex flex-col gap-1">
        {row.changes.map((change) => (
          <li key={change.field} className="flex items-center justify-between gap-3 type-body-sm">
            <span className="text-ink">{fields(`fields.${change.field}`)}</span>
            <span className="flex items-center gap-1.5 tabular-nums text-ink">
              <span className="text-ink-faint line-through">
                {shown(change.field, change.before)}
              </span>
              <ArrowRight aria-hidden className="size-3.5 text-ink-faint" />
              <span className="font-medium">{shown(change.field, change.after)}</span>
            </span>
          </li>
        ))}
      </ul>
      {person.canManage && (
        <Button
          size="sm"
          variant="secondary"
          leadingIcon={adding ? <Plus /> : <RefreshCw />}
          onClick={() => setAsking(true)}
          className="self-start"
        >
          {t('refresh')}
        </Button>
      )}
      <Dialog
        open={asking}
        onOpenChange={(next) => !next && close()}
        title={t('confirmTitle', { name: row.person.fullName })}
        description={t('confirmBody')}
        size="sm"
        footer={
          <>
            <Button variant="quiet" onClick={close}>
              {t('cancel')}
            </Button>
            <Button variant="primary" pending={form.pending} onClick={confirm}>
              {t('confirm')}
            </Button>
          </>
        }
      >
        <FormError message={form.error} />
      </Dialog>
    </div>
  );
}
