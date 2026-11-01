'use client';

import type { LendingPartner } from '@oneohm/api-contracts';
import { Badge, Button, Dialog } from '@oneohm/design-system/web';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { FormError } from '@/components/form-error';
import { api, expectStatus } from '@/lib/api/api-client';
import { useApiForm } from '@/lib/forms/use-api-form';
import { useInvalidateFinance, useLenders } from '../use-finance';
import { LenderForm } from './lender-form';
import { usePatternSummary } from './pattern-summary';

/** Banks and NBFCs OneOhm works with: the documents each asks for and how each pays. */
export function LendersDialog({
  open,
  onOpenChange,
}: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations('finance.loans.lendersDialog');
  const invalidate = useInvalidateFinance();
  const lenders = useLenders();
  const toggleForm = useApiForm();
  const summary = usePatternSummary();
  const [editing, setEditing] = useState<LendingPartner | null>(null);

  const toggle = async (lender: LendingPartner) => {
    const saved = await toggleForm.run(() =>
      expectStatus(
        api.finance.updateLender({ params: { id: lender.id }, body: { active: !lender.active } }),
        200,
      ),
    );
    if (saved) await invalidate();
  };

  const describe = (lender: LendingPartner) => {
    const kind = t(`pattern.${lender.disbursement}`);
    const pays =
      lender.disbursement === 'tranches' ? t('summary', { kind, parts: summary(lender) }) : kind;
    return [pays, ...lender.requiredDocuments].join(' · ');
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setEditing(null);
        onOpenChange(next);
      }}
      title={t('title')}
      description={t('description')}
      size="lg"
    >
      <div className="flex flex-col gap-6">
        {(lenders.data ?? []).length > 0 ? (
          <ul className="flex flex-col divide-y divide-hairline rounded-lg ring-1 ring-hairline">
            {(lenders.data ?? []).map((lender) => (
              <li
                key={lender.id}
                className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1 px-4 py-3"
              >
                <div className="flex min-w-0 flex-1 basis-56 flex-col gap-1">
                  <span className="flex items-center gap-2 type-body font-medium text-ink">
                    {lender.name}
                    {!lender.active && <Badge variant="outline">{t('inactive')}</Badge>}
                  </span>
                  <span className="type-body-sm text-ink-faint">{describe(lender)}</span>
                </div>
                <div className="-mr-2 flex shrink-0 gap-1">
                  <Button size="sm" variant="quiet" onClick={() => setEditing(lender)}>
                    {t('edit')}
                  </Button>
                  <Button size="sm" variant="quiet" onClick={() => toggle(lender)}>
                    {lender.active ? t('deactivate') : t('activate')}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="type-body-sm text-ink-muted">{t('none')}</p>
        )}
        <FormError message={toggleForm.error} />
        <LenderForm key={editing?.id ?? 'new'} lender={editing} onDone={() => setEditing(null)} />
      </div>
    </Dialog>
  );
}
