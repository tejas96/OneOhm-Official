'use client';

import type { StockRow } from '@oneohm/api-contracts';
import {
  Button,
  Dialog,
  Field,
  Input,
  SegmentedControl,
  Select,
  Textarea,
  useToast,
} from '@oneohm/design-system/web';
import { parseSerials } from '@oneohm/domain';
import { useTranslations } from 'next-intl';
import { type FormEvent, useEffect, useId, useState } from 'react';
import { FormError } from '@/components/form-error';
import { api, expectStatus } from '@/lib/api/api-client';
import { useApiForm } from '@/lib/forms/use-api-form';
import { useLocations, useRefreshInventory } from '../use-inventory';

type Direction = 'add' | 'remove';

/** Opening stock, count corrections and write-offs, always with a reason. */
export function AdjustDialog({
  open,
  productId,
  rows,
  onClose,
}: {
  readonly open: boolean;
  readonly productId: string | null;
  readonly rows: readonly StockRow[];
  readonly onClose: () => void;
}) {
  const t = useTranslations('inventory.adjust');
  const formId = useId();
  const toast = useToast();
  const refresh = useRefreshInventory();
  const locations = useLocations();
  const form = useApiForm();
  const [product, setProduct] = useState<string | undefined>(undefined);
  const [location, setLocation] = useState<string | undefined>(undefined);
  const [direction, setDirection] = useState<Direction>('add');
  const [quantity, setQuantity] = useState('');
  const [reason, setReason] = useState('');
  const [serialText, setSerialText] = useState('');
  const { reset } = form;

  useEffect(() => {
    if (!open) return;
    setProduct(productId ?? undefined);
    setDirection('add');
    setQuantity('');
    setReason('');
    setSerialText('');
    reset();
  }, [open, productId, reset]);

  const firstLocation = locations.data?.find((entry) => entry.active)?.id;
  const chosenLocation = location ?? firstLocation;
  const row = rows.find((entry) => entry.productId === product);
  const serials = parseSerials(serialText);
  const errors = form.fieldErrors;

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const amount = Number(quantity.replace(/,/g, ''));
    const saved = await form.run(() =>
      expectStatus(
        api.inventory.stock.adjust({
          body: {
            productId: product ?? '',
            locationId: chosenLocation ?? '',
            quantity: direction === 'add' ? amount : -amount,
            reason,
            serials: row?.serialised ? serials : [],
          },
        }),
        201,
      ),
    );
    if (!saved) return;
    await refresh();
    toast({ tone: 'success', title: t('saved'), reference: row?.name });
    onClose();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => !next && onClose()}
      title={t('title')}
      description={t('description')}
      size="lg"
      footer={
        <Button type="submit" form={formId} variant="primary" pending={form.pending}>
          {t('save')}
        </Button>
      }
    >
      <form id={formId} onSubmit={submit} noValidate className="flex flex-col gap-5">
        <FormError message={form.error} />
        <Field label={t('product')} error={errors.productId} required>
          <Select
            value={product}
            onValueChange={setProduct}
            options={rows.map((entry) => ({ value: entry.productId, label: entry.name }))}
            label={t('product')}
          />
        </Field>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label={t('location')} error={errors.locationId}>
            <Select
              value={chosenLocation}
              onValueChange={setLocation}
              options={(locations.data ?? [])
                .filter((entry) => entry.active)
                .map((entry) => ({ value: entry.id, label: entry.name }))}
              label={t('location')}
            />
          </Field>
          <Field label={t('direction')}>
            <SegmentedControl
              value={direction}
              onValueChange={setDirection}
              options={[
                { value: 'add', label: t('add') },
                { value: 'remove', label: t('remove') },
              ]}
              label={t('direction')}
            />
          </Field>
        </div>
        <Field label={t('quantity')} error={errors.quantity} required>
          <Input
            inputMode="decimal"
            value={quantity}
            onChange={(event) => setQuantity(event.target.value)}
            trailing={row ? <span className="text-ink-faint">{row.unit}</span> : undefined}
          />
        </Field>
        <Field label={t('reason')} hint={t('reasonHint')} error={errors.reason} required>
          <Input value={reason} onChange={(event) => setReason(event.target.value)} />
        </Field>
        {row?.serialised && (
          <Field
            label={t('serials')}
            hint={`${t('serialsHint')} ${t('serialCount', { count: serials.length })}`}
            error={errors.serials}
            required
          >
            <Textarea
              rows={4}
              value={serialText}
              onChange={(event) => setSerialText(event.target.value)}
              className="font-mono uppercase"
            />
          </Field>
        )}
      </form>
    </Dialog>
  );
}
