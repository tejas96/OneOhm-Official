'use client';

import { Button, Dialog, Field, Input, Select, useToast } from '@oneohm/design-system/web';
import { formatInr } from '@oneohm/shared';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { type FormEvent, useEffect, useId, useState } from 'react';
import { FormError } from '@/components/form-error';
import { api, expectStatus } from '@/lib/api/api-client';
import { useApiForm } from '@/lib/forms/use-api-form';
import { NumberInput } from '../../settings/number-input';
import { useAdvances, useRefreshPurchasing } from '../use-purchasing';

/**
 * Records an advance against a sent purchase order. It waits for approval, then is paid;
 * the vendor's bill for that order is later reduced by it.
 */
export function RecordAdvanceDialog({
  open,
  orderId,
  vendorId,
  onClose,
}: {
  readonly open: boolean;
  /** Preselects the order, e.g. when opened from the order itself. */
  readonly orderId?: string | null;
  /** Offers only this vendor's orders, e.g. from the vendor's page. */
  readonly vendorId?: string;
  readonly onClose: () => void;
}) {
  const t = useTranslations('purchasing.advances.record');
  const formId = useId();
  const toast = useToast();
  const refresh = useRefreshPurchasing();
  const form = useApiForm();
  const { reset } = form;
  const [chosen, setChosen] = useState<string | undefined>(undefined);
  const [amount, setAmount] = useState<number | null>(null);
  const [note, setNote] = useState('');
  const orders = useQuery({
    queryKey: ['inventory', 'orders', 'all'],
    queryFn: () => expectStatus(api.inventory.purchaseOrders.list({ query: {} }), 200),
    enabled: open,
  });
  const openOrders = (orders.data ?? []).filter(
    (order) =>
      (order.status === 'sent' || order.status === 'partly_received') &&
      (!vendorId || order.vendorId === vendorId),
  );
  const order = openOrders.find((row) => row.id === chosen);
  const existing = useAdvances('all', chosen, open && chosen !== undefined);
  const advanced = (existing.data ?? [])
    .filter((row) => row.status !== 'cancelled')
    .reduce((sum, row) => sum + row.amountPaise, 0);
  const room = order ? Math.max(0, order.totalPaise - advanced) : 0;

  useEffect(() => {
    if (!open) return;
    setChosen(orderId ?? undefined);
    setAmount(null);
    setNote('');
    reset();
  }, [open, orderId, reset]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const saved = await form.run(() =>
      expectStatus(
        api.purchasing.advances.create({
          body: { purchaseOrderId: chosen ?? '', amountPaise: amount ?? 0, note },
        }),
        201,
      ),
    );
    if (!saved) return;
    await refresh();
    toast({
      tone: 'success',
      title: t('done', { number: saved.number }),
      description: saved.vendor.name,
    });
    onClose();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => !next && onClose()}
      title={t('title')}
      description={t('description')}
      autoFocusField
      footer={
        <Button type="submit" form={formId} variant="primary" pending={form.pending}>
          {t('submit')}
        </Button>
      }
    >
      <form id={formId} onSubmit={submit} noValidate className="flex flex-col gap-4">
        <Field label={t('order')} required error={form.fieldErrors.purchaseOrderId}>
          <Select
            value={chosen}
            onValueChange={setChosen}
            placeholder={t('pickOrder')}
            options={openOrders.map((row) => ({
              value: row.id,
              label: `${row.number} · ${row.vendorName} · ${formatInr(row.totalPaise)}`,
            }))}
          />
        </Field>
        <Field
          label={t('amount')}
          required
          hint={
            order ? t('room', { room: formatInr(room), advanced: formatInr(advanced) }) : undefined
          }
          error={form.fieldErrors.amountPaise}
        >
          <NumberInput unit="paise" value={amount} onValueChange={setAmount} />
        </Field>
        <Field label={t('note')} error={form.fieldErrors.note}>
          <Input value={note} onChange={(event) => setNote(event.target.value)} />
        </Field>
        <FormError message={form.error} />
      </form>
    </Dialog>
  );
}
