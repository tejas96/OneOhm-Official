'use client';

import type { PurchaseOrderDetail } from '@oneohm/api-contracts';
import {
  Button,
  Dialog,
  Field,
  Input,
  Select,
  Textarea,
  useToast,
} from '@oneohm/design-system/web';
import { parseSerials } from '@oneohm/domain';
import { todayIn } from '@oneohm/shared';
import { useTranslations } from 'next-intl';
import { type FormEvent, useEffect, useId, useState } from 'react';
import { FormError } from '@/components/form-error';
import { api, expectStatus } from '@/lib/api/api-client';
import { useApiForm } from '@/lib/forms/use-api-form';
import { formatQuantity, useLocations, useRefreshInventory } from '../use-inventory';

interface LineEntry {
  quantity: string;
  serials: string;
  cellManufacturer: string;
  cellInvoiceNumber: string;
}

/** Records what arrived: quantities, a serial per unit, and the DCR cell details. */
export function ReceiveDialog({
  order,
  onClose,
}: {
  readonly order: PurchaseOrderDetail | null;
  readonly onClose: () => void;
}) {
  const t = useTranslations('inventory.receive');
  const formId = useId();
  const toast = useToast();
  const refresh = useRefreshInventory();
  const locations = useLocations();
  const form = useApiForm();
  const [receivedOn, setReceivedOn] = useState(todayIn());
  const [location, setLocation] = useState<string | undefined>(undefined);
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [invoiceDate, setInvoiceDate] = useState('');
  const [entries, setEntries] = useState<Record<string, LineEntry>>({});
  const { reset } = form;
  const open = (order?.lines ?? []).filter((line) => line.quantity - line.receivedQuantity > 0);

  useEffect(() => {
    if (!order) return;
    setReceivedOn(todayIn());
    setInvoiceNumber('');
    setInvoiceDate('');
    setEntries(
      Object.fromEntries(
        order.lines.map((line) => [
          line.id,
          {
            quantity: formatQuantity(Math.max(0, line.quantity - line.receivedQuantity)),
            serials: '',
            cellManufacturer: '',
            cellInvoiceNumber: '',
          },
        ]),
      ),
    );
    reset();
  }, [order, reset]);

  const update = (id: string, patch: Partial<LineEntry>) =>
    setEntries((current) => ({ ...current, [id]: { ...(current[id] as LineEntry), ...patch } }));
  const chosenLocation = location ?? locations.data?.find((entry) => entry.active)?.id ?? null;
  const quantityOf = (id: string) => Number(entries[id]?.quantity.replace(/,/g, '') ?? 0);
  const submitted = open.filter((line) => quantityOf(line.id) > 0);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!order) return;
    const lines = submitted
      .map((line) => ({ line, entry: entries[line.id] }))
      .map(({ line, entry }) => ({
        lineId: line.id,
        quantity: quantityOf(line.id),
        serials: line.serialised ? parseSerials(entry?.serials ?? '') : [],
        cellManufacturer: line.category === 'panel' ? (entry?.cellManufacturer ?? '') : '',
        cellInvoiceNumber: line.category === 'panel' ? (entry?.cellInvoiceNumber ?? '') : '',
      }));
    const saved = await form.run(() =>
      expectStatus(
        api.inventory.purchaseOrders.receive({
          params: { id: order.id },
          body: {
            locationId: chosenLocation,
            receivedOn,
            vendorInvoiceNumber: invoiceNumber,
            vendorInvoiceDate: invoiceDate || null,
            notes: '',
            lines,
          },
        }),
        201,
      ),
    );
    if (!saved) return;
    await refresh(saved.projectId);
    toast({ tone: 'success', title: t('saved', { number: saved.number }) });
    onClose();
  };

  const errors = form.fieldErrors;
  return (
    <Dialog
      open={order !== null}
      onOpenChange={(next) => !next && onClose()}
      title={order ? t('title', { number: order.number }) : ''}
      description={t('description')}
      size="lg"
      footer={
        <Button type="submit" form={formId} variant="primary" pending={form.pending}>
          {t('save')}
        </Button>
      }
    >
      <form id={formId} onSubmit={submit} noValidate className="flex flex-col gap-5">
        <FormError message={errors.lines ? t('nothing') : form.error} />
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label={t('receivedOn')} error={errors.receivedOn} required>
            <Input type="date" value={receivedOn} onChange={(e) => setReceivedOn(e.target.value)} />
          </Field>
          <Field label={t('location')} error={errors.locationId}>
            <Select
              value={chosenLocation ?? undefined}
              onValueChange={setLocation}
              options={(locations.data ?? [])
                .filter((entry) => entry.active)
                .map((entry) => ({ value: entry.id, label: entry.name }))}
              label={t('location')}
            />
          </Field>
          <Field label={t('invoiceNumber')} error={errors.vendorInvoiceNumber}>
            <Input value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} />
          </Field>
          <Field label={t('invoiceDate')} error={errors.vendorInvoiceDate}>
            <Input
              type="date"
              value={invoiceDate}
              onChange={(e) => setInvoiceDate(e.target.value)}
            />
          </Field>
        </div>
        {open.map((line) => {
          const position = submitted.findIndex((entry) => entry.id === line.id);
          const entry = entries[line.id];
          const error = (key: string) =>
            position >= 0 ? errors[`lines.${position}.${key}`] : undefined;
          return (
            <fieldset
              key={line.id}
              className="flex flex-col gap-4 rounded-2xl border border-hairline p-4"
            >
              <legend className="px-1 type-body font-medium text-ink">{line.description}</legend>
              <p className="-mt-2 type-label text-ink-faint">
                {t('due', {
                  remaining: formatQuantity(line.quantity - line.receivedQuantity),
                  unit: line.unit,
                })}
              </p>
              <Field label={t('quantity')} error={error('quantity')}>
                <Input
                  inputMode="decimal"
                  value={entry?.quantity ?? ''}
                  onChange={(e) => update(line.id, { quantity: e.target.value })}
                  trailing={<span className="text-ink-faint">{line.unit}</span>}
                />
              </Field>
              {line.serialised && (
                <Field label={t('serials')} hint={t('serialsHint')} error={error('serials')}>
                  <Textarea
                    rows={3}
                    value={entry?.serials ?? ''}
                    onChange={(e) => update(line.id, { serials: e.target.value })}
                    className="font-mono uppercase"
                  />
                </Field>
              )}
              {line.category === 'panel' && (
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label={t('cellManufacturer')} hint={t('cellHint')}>
                    <Input
                      value={entry?.cellManufacturer ?? ''}
                      onChange={(e) => update(line.id, { cellManufacturer: e.target.value })}
                    />
                  </Field>
                  <Field label={t('cellInvoice')}>
                    <Input
                      value={entry?.cellInvoiceNumber ?? ''}
                      onChange={(e) => update(line.id, { cellInvoiceNumber: e.target.value })}
                    />
                  </Field>
                </div>
              )}
            </fieldset>
          );
        })}
      </form>
    </Dialog>
  );
}
