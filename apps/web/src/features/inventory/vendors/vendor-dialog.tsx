'use client';

import type { Vendor, VendorInput } from '@oneohm/api-contracts';
import {
  Button,
  Checkbox,
  Dialog,
  Field,
  Input,
  Switch,
  Textarea,
  useToast,
} from '@oneohm/design-system/web';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { type FormEvent, useEffect, useId, useState } from 'react';
import { FormError } from '@/components/form-error';
import { api, expectStatus } from '@/lib/api/api-client';
import { useApiForm } from '@/lib/forms/use-api-form';
import { useRefreshInventory } from '../use-inventory';
import { VendorBankFields } from './vendor-bank-fields';

interface Draft {
  name: string;
  gstin: string;
  contactName: string;
  phone: string;
  email: string;
  address: string;
  paymentTermsDays: string;
  bankAccountName: string;
  bankIfsc: string;
  bankAccountNumber: string;
  notes: string;
  active: boolean;
  productIds: string[];
}

const BLANK: Draft = {
  name: '',
  gstin: '',
  contactName: '',
  phone: '',
  email: '',
  address: '',
  paymentTermsDays: '30',
  bankAccountName: '',
  bankIfsc: '',
  bankAccountNumber: '',
  notes: '',
  active: true,
  productIds: [],
};

const draftFrom = (vendor: Vendor): Draft => ({
  name: vendor.name,
  gstin: vendor.gstin ?? '',
  contactName: vendor.contactName ?? '',
  phone: vendor.phone ?? '',
  email: vendor.email ?? '',
  address: vendor.address ?? '',
  paymentTermsDays: String(vendor.paymentTermsDays),
  bankAccountName: vendor.bankAccountName ?? '',
  bankIfsc: vendor.bankIfsc ?? '',
  // Never shown in full; typing a new number replaces the saved one.
  bankAccountNumber: '',
  notes: vendor.notes ?? '',
  active: vendor.active,
  productIds: [...vendor.productIds],
});

/** Add or edit a vendor and the catalog products they supply. */
export function VendorDialog({
  open,
  vendor,
  onClose,
}: {
  readonly open: boolean;
  readonly vendor: Vendor | null;
  readonly onClose: () => void;
}) {
  const t = useTranslations('inventory.vendorForm');
  const formId = useId();
  const toast = useToast();
  const refresh = useRefreshInventory();
  const form = useApiForm();
  const [draft, setDraft] = useState<Draft>(BLANK);
  const { reset } = form;
  const products = useQuery({
    queryKey: ['catalog', 'products'],
    queryFn: () => expectStatus(api.catalog.listProducts({ query: {} }), 200),
    enabled: open,
  });

  useEffect(() => {
    if (!open) return;
    setDraft(vendor ? draftFrom(vendor) : BLANK);
    reset();
  }, [open, vendor, reset]);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));
  const toggle = (id: string, on: boolean) =>
    set('productIds', on ? [...draft.productIds, id] : draft.productIds.filter((x) => x !== id));
  const errors = form.fieldErrors;

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const body: VendorInput = {
      ...draft,
      paymentTermsDays: Number(draft.paymentTermsDays || 0),
    };
    await form.run(
      () =>
        vendor
          ? expectStatus(api.inventory.vendors.update({ params: { id: vendor.id }, body }), 200)
          : expectStatus(api.inventory.vendors.create({ body }), 201),
      async (saved) => {
        await refresh();
        toast({
          tone: 'success',
          title: vendor ? t('updated', { name: saved.name }) : t('created', { name: saved.name }),
        });
        onClose();
      },
    );
  };

  const text = (key: Exclude<keyof Draft, 'active' | 'productIds'>) => ({
    value: draft[key],
    onChange: (event: { target: { value: string } }) => set(key, event.target.value),
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => !next && onClose()}
      title={vendor ? t('editTitle') : t('createTitle')}
      size="lg"
      autoFocusField
      footer={
        <Button type="submit" form={formId} variant="primary" pending={form.pending}>
          {vendor ? t('save') : t('create')}
        </Button>
      }
    >
      <form id={formId} onSubmit={submit} noValidate className="flex flex-col gap-5">
        <FormError message={form.error} />
        <Field label={t('name')} error={errors.name} required>
          <Input {...text('name')} />
        </Field>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label={t('gstin')} error={errors.gstin}>
            <Input {...text('gstin')} className="font-mono uppercase" />
          </Field>
          <Field label={t('terms')} error={errors.paymentTermsDays}>
            <Input inputMode="numeric" {...text('paymentTermsDays')} />
          </Field>
          <Field label={t('contactName')} error={errors.contactName}>
            <Input {...text('contactName')} />
          </Field>
          <Field label={t('phone')} error={errors.phone}>
            <Input inputMode="tel" {...text('phone')} />
          </Field>
        </div>
        <Field label={t('email')} error={errors.email}>
          <Input type="email" {...text('email')} />
        </Field>
        <Field label={t('address')} error={errors.address}>
          <Textarea rows={2} {...text('address')} />
        </Field>
        <VendorBankFields
          text={text}
          errors={errors}
          savedAccount={vendor?.bankAccountMasked ?? null}
        />
        {(products.data?.length ?? 0) > 0 && (
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 type-label font-medium text-ink">{t('products')}</legend>
            <div className="grid gap-1 sm:grid-cols-2">
              {products.data?.map((product) => (
                <Checkbox
                  key={product.id}
                  checked={draft.productIds.includes(product.id)}
                  onCheckedChange={(on) => toggle(product.id, on)}
                  label={product.name}
                  description={product.sku}
                />
              ))}
            </div>
          </fieldset>
        )}
        <Field label={t('notes')} error={errors.notes}>
          <Textarea rows={2} {...text('notes')} />
        </Field>
        <Switch
          checked={draft.active}
          onCheckedChange={(value) => set('active', value)}
          label={t('active')}
          description={t('activeHint')}
        />
      </form>
    </Dialog>
  );
}
