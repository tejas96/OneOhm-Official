'use client';

import type { LendingPartner } from '@oneohm/api-contracts';
import {
  Badge,
  Button,
  Dialog,
  Field,
  Input,
  Select,
  Textarea,
  useToast,
} from '@oneohm/design-system/web';
import { Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { type FormEvent, useId, useState } from 'react';
import { FormError } from '@/components/form-error';
import { api, expectStatus } from '@/lib/api/api-client';
import { useApiForm } from '@/lib/forms/use-api-form';
import { useInvalidateFinance, useLenders } from '../use-finance';

/** Banks and NBFCs OneOhm works with, each with the documents it always asks for. */
export function LendersDialog({
  open,
  onOpenChange,
}: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations('finance.loans.lendersDialog');
  const formId = useId();
  const toast = useToast();
  const invalidate = useInvalidateFinance();
  const lenders = useLenders();
  const form = useApiForm();
  const [name, setName] = useState('');
  const [documents, setDocuments] = useState('');
  const [disbursement, setDisbursement] = useState<'single' | 'tranches'>('single');

  const toggle = async (lender: LendingPartner) => {
    const saved = await form.run(() =>
      expectStatus(
        api.finance.updateLender({ params: { id: lender.id }, body: { active: !lender.active } }),
        200,
      ),
    );
    if (saved) await invalidate();
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const created = await form.run(() =>
      expectStatus(
        api.finance.createLender({
          body: {
            name,
            disbursement,
            active: true,
            requiredDocuments: documents
              .split('\n')
              .map((line) => line.trim())
              .filter(Boolean),
          },
        }),
        201,
      ),
    );
    if (!created) return;
    await invalidate();
    toast({ title: t('added', { name: created.name }), tone: 'success' });
    setName('');
    setDocuments('');
    setDisbursement('single');
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('title')}
      description={t('description')}
      size="lg"
    >
      <div className="flex flex-col gap-6">
        {(lenders.data ?? []).length > 0 ? (
          <ul className="flex flex-col divide-y divide-hairline rounded-lg ring-1 ring-hairline">
            {(lenders.data ?? []).map((lender) => (
              <li key={lender.id} className="flex items-start justify-between gap-3 px-4 py-3">
                <div className="flex min-w-0 flex-col gap-1">
                  <span className="flex items-center gap-2 type-body font-medium text-ink">
                    {lender.name}
                    {!lender.active && <Badge variant="outline">{t('inactive')}</Badge>}
                  </span>
                  <span className="type-body-sm text-ink-faint">
                    {t(`pattern.${lender.disbursement}`)}
                    {lender.requiredDocuments.length > 0 &&
                      ` · ${lender.requiredDocuments.join(', ')}`}
                  </span>
                </div>
                <Button size="sm" variant="quiet" onClick={() => toggle(lender)}>
                  {lender.active ? t('deactivate') : t('activate')}
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="type-body-sm text-ink-muted">{t('none')}</p>
        )}
        <form id={formId} onSubmit={submit} noValidate className="grid gap-4 sm:grid-cols-2">
          <Field label={t('name')} required error={form.fieldErrors.name}>
            <Input value={name} onChange={(event) => setName(event.target.value)} />
          </Field>
          <Field label={t('disbursement')}>
            <Select
              value={disbursement}
              onValueChange={setDisbursement}
              options={(['single', 'tranches'] as const).map((value) => ({
                value,
                label: t(`pattern.${value}`),
              }))}
            />
          </Field>
          <Field label={t('documents')} hint={t('documentsHint')} className="sm:col-span-2">
            <Textarea
              rows={3}
              value={documents}
              onChange={(event) => setDocuments(event.target.value)}
            />
          </Field>
          <div className="flex flex-col gap-3 sm:col-span-2">
            <FormError message={form.error} />
            <Button
              type="submit"
              variant="primary"
              leadingIcon={<Plus />}
              pending={form.pending}
              className="self-end"
            >
              {t('add')}
            </Button>
          </div>
        </form>
      </div>
    </Dialog>
  );
}
