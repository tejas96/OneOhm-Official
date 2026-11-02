'use client';

import type { PurchaseRequest } from '@oneohm/api-contracts';
import { Badge, Button, Field, Input, Select, Sheet, useToast } from '@oneohm/design-system/web';
import { purchaseLineTotal } from '@oneohm/domain';
import { formatInr, todayIn } from '@oneohm/shared';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { type FormEvent, useEffect, useId, useState } from 'react';
import { FormError } from '@/components/form-error';
import { api, expectStatus } from '@/lib/api/api-client';
import { useApiForm } from '@/lib/forms/use-api-form';
import { formatQuantity, useVendors } from '../../inventory/use-inventory';
import { NumberInput } from '../../settings/number-input';
import { useRefreshPurchasing, useRequest } from '../use-purchasing';

type Rates = Record<string, { ratePaise: number | null; taxRateBp: number | null }>;

const lineTotal = (quantity: number, rate: Rates[string] | undefined) =>
  purchaseLineTotal({
    quantity,
    ratePaise: rate?.ratePaise ?? 0,
    taxRateBp: rate?.taxRateBp ?? 0,
  });

/** Vendors that supply every item on the request come first, marked as such. */
function useVendorOptions(request: PurchaseRequest | undefined) {
  const t = useTranslations('purchasing.requests.order');
  const vendors = useVendors();
  const active = (vendors.data ?? []).filter((vendor) => vendor.active);
  const suppliesAll = (ids: readonly string[]) =>
    (request?.lines ?? []).every((line) => ids.includes(line.productId));
  return [...active]
    .sort((a, b) => Number(suppliesAll(b.productIds)) - Number(suppliesAll(a.productIds)))
    .map((vendor) => ({
      value: vendor.id,
      label: suppliesAll(vendor.productIds) ? `${vendor.name} · ${t('supplies')}` : vendor.name,
    }));
}

/** An approved request becomes a draft purchase order: vendor, dates and agreed rates. */
export function OrderRequestSheet({
  requestId,
  onClose,
}: {
  readonly requestId: string | null;
  readonly onClose: () => void;
}) {
  const t = useTranslations('purchasing.requests.order');
  const formId = useId();
  const toast = useToast();
  const router = useRouter();
  const refresh = useRefreshPurchasing();
  const form = useApiForm();
  const { reset } = form;
  const query = useRequest(requestId);
  const request = query.data;
  const vendorOptions = useVendorOptions(request);
  const [vendorId, setVendorId] = useState<string | undefined>(undefined);
  const [orderDate, setOrderDate] = useState(todayIn());
  const [expectedOn, setExpectedOn] = useState('');
  const [rates, setRates] = useState<Rates>({});

  useEffect(() => {
    if (!request) return;
    setVendorId(undefined);
    setOrderDate(todayIn());
    setExpectedOn(request.neededBy ?? '');
    setRates(
      Object.fromEntries(
        request.lines.map((line) => [
          line.id,
          { ratePaise: line.costPaise, taxRateBp: line.taxRateBp },
        ]),
      ),
    );
    reset();
  }, [request, reset]);

  const total = (request?.lines ?? []).reduce(
    (sum, line) => sum + lineTotal(line.quantity, rates[line.id]),
    0,
  );
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!request) return;
    await form.run(
      () =>
        expectStatus(
          api.purchasing.requests.order({
            params: { id: request.id },
            body: {
              vendorId: vendorId ?? '',
              orderDate,
              expectedOn: expectedOn || null,
              lines: request.lines.map((line) => ({
                lineId: line.id,
                ratePaise: rates[line.id]?.ratePaise ?? 0,
                taxRateBp: rates[line.id]?.taxRateBp ?? 0,
              })),
            },
          }),
          201,
        ),
      async (saved) => {
        if (!saved.purchaseOrder) return;
        await refresh();
        toast({ tone: 'success', title: t('done', { number: saved.purchaseOrder.number }) });
        router.push(`/inventory?tab=orders&order=${saved.purchaseOrder.id}`);
      },
    );
  };

  const errors = form.fieldErrors;
  return (
    <Sheet
      open={requestId !== null}
      onOpenChange={(value) => !value && onClose()}
      title={request ? t('title', { number: request.number }) : t('loading')}
      description={t('description')}
      width="lg"
      footer={
        <div className="flex w-full flex-wrap items-center justify-between gap-3">
          <span className="type-body-sm text-ink-muted">
            {t('total')}{' '}
            <span className="type-title-md text-ink tabular-nums">{formatInr(total)}</span>
          </span>
          <Button type="submit" form={formId} variant="primary" pending={form.pending}>
            {t('submit')}
          </Button>
        </div>
      }
    >
      <form
        id={formId}
        onSubmit={submit}
        noValidate
        className="flex flex-col gap-6 px-5 py-6 sm:px-6"
      >
        <FormError message={form.error} />
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label={t('vendor')} required error={errors.vendorId} className="sm:col-span-3">
            <Select
              value={vendorId}
              onValueChange={setVendorId}
              placeholder={t('pickVendor')}
              options={vendorOptions}
            />
          </Field>
          <Field label={t('orderDate')} required error={errors.orderDate}>
            <Input
              type="date"
              value={orderDate}
              onChange={(event) => setOrderDate(event.target.value)}
            />
          </Field>
          <Field label={t('expectedOn')} hint={t('expectedHint')} error={errors.expectedOn}>
            <Input
              type="date"
              value={expectedOn}
              onChange={(event) => setExpectedOn(event.target.value)}
            />
          </Field>
        </div>
        <ul className="flex flex-col gap-3">
          {(request?.lines ?? []).map((line) => (
            <li
              key={line.id}
              className="grid gap-3 rounded-2xl border border-hairline p-4 sm:grid-cols-[minmax(0,1fr)_9rem_6rem] sm:items-end"
            >
              <div className="flex min-w-0 flex-col gap-1">
                <p className="type-body text-ink">{line.name}</p>
                <p className="flex flex-wrap items-center gap-2 type-label text-ink-faint">
                  {formatQuantity(line.quantity)} {line.unit}
                  <Badge variant="soft">
                    {formatInr(lineTotal(line.quantity, rates[line.id]))}
                  </Badge>
                </p>
              </div>
              <Field label={t('rate', { unit: line.unit })}>
                <NumberInput
                  unit="paise"
                  value={rates[line.id]?.ratePaise ?? null}
                  onValueChange={(ratePaise) =>
                    setRates((current) => ({
                      ...current,
                      [line.id]: { taxRateBp: current[line.id]?.taxRateBp ?? 0, ratePaise },
                    }))
                  }
                />
              </Field>
              <Field label={t('gst')}>
                <NumberInput
                  unit="basisPoints"
                  value={rates[line.id]?.taxRateBp ?? null}
                  onValueChange={(taxRateBp) =>
                    setRates((current) => ({
                      ...current,
                      [line.id]: { ratePaise: current[line.id]?.ratePaise ?? 0, taxRateBp },
                    }))
                  }
                />
              </Field>
            </li>
          ))}
        </ul>
      </form>
    </Sheet>
  );
}
