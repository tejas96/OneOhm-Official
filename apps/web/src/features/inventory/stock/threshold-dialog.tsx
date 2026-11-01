'use client';

import type { StockRow } from '@oneohm/api-contracts';
import { Button, Dialog, Field, Input, useToast } from '@oneohm/design-system/web';
import { useTranslations } from 'next-intl';
import { type FormEvent, useEffect, useId, useState } from 'react';
import { FormError } from '@/components/form-error';
import { api, expectStatus } from '@/lib/api/api-client';
import { useApiForm } from '@/lib/forms/use-api-form';
import { useRefreshInventory } from '../use-inventory';

/** The free-stock level below which the store is alerted for one product. */
export function ThresholdDialog({
  row,
  onClose,
}: {
  readonly row: StockRow | null;
  readonly onClose: () => void;
}) {
  const t = useTranslations('inventory.threshold');
  const formId = useId();
  const toast = useToast();
  const refresh = useRefreshInventory();
  const form = useApiForm();
  const [minimum, setMinimum] = useState('');
  const { reset } = form;

  useEffect(() => {
    if (!row) return;
    setMinimum(row.minimum === null ? '' : String(row.minimum));
    reset();
  }, [row, reset]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!row) return;
    const text = minimum.replace(/,/g, '').trim();
    const saved = await form.run(() =>
      expectStatus(
        api.inventory.stock.setThreshold({
          params: { id: row.productId },
          body: { minimum: text === '' ? null : Number(text) },
        }),
        200,
      ),
    );
    if (!saved) return;
    await refresh();
    toast({ tone: 'success', title: t('saved'), reference: row.name });
    onClose();
  };

  return (
    <Dialog
      open={row !== null}
      onOpenChange={(next) => !next && onClose()}
      title={t('title')}
      description={row ? t('description', { name: row.name }) : undefined}
      size="sm"
      autoFocusField
      footer={
        <Button type="submit" form={formId} variant="primary" pending={form.pending}>
          {t('save')}
        </Button>
      }
    >
      <form id={formId} onSubmit={submit} noValidate className="flex flex-col gap-4">
        <FormError message={form.error} />
        <Field
          label={t('minimum', { unit: row?.unit ?? '' })}
          hint={t('hint')}
          error={form.fieldErrors.minimum}
        >
          <Input
            inputMode="decimal"
            value={minimum}
            onChange={(event) => setMinimum(event.target.value)}
          />
        </Field>
      </form>
    </Dialog>
  );
}
