'use client';

import type { Product, ProductInput } from '@oneohm/api-contracts';
import { Button, Dialog, Field, Input, Select, Switch, useToast } from '@oneohm/design-system/web';
import { asUnit, LINE_CATEGORIES } from '@oneohm/domain';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { type FormEvent, useEffect, useId, useState } from 'react';
import { FormError } from '@/components/form-error';
import { UnitSelect } from '@/components/unit-select';
import { api, expectStatus } from '@/lib/api/api-client';
import { useApiForm } from '@/lib/forms/use-api-form';
import { NumberInput } from '../number-input';
import { SETTINGS_KEYS } from '../use-settings';
import { ProductSpecs } from './product-specs';

const BLANK: ProductInput = {
  sku: '',
  name: '',
  brand: '',
  category: 'panel',
  unit: 'nos',
  wattageWp: null,
  ratedW: null,
  dcr: true,
  pricePaise: 0,
  costPaise: 0,
  taxRateBp: 500,
  active: true,
};

const inputFrom = ({ id: _id, datasheet: _sheet, ...product }: Product): ProductInput => ({
  ...product,
  unit: asUnit(product.unit),
});

/** Add or edit one catalog product; `product` null with `open` adds. */
export function ProductDialog({
  open,
  product,
  onClose,
}: {
  readonly open: boolean;
  readonly product: Product | null;
  readonly onClose: () => void;
}) {
  const t = useTranslations('settings.products');
  const dialogT = useTranslations('settings.products.dialog');
  const settingsT = useTranslations('settings');
  const formId = useId();
  const toast = useToast();
  const queryClient = useQueryClient();
  const form = useApiForm();
  const [draft, setDraft] = useState<ProductInput>(BLANK);
  const { reset } = form;

  useEffect(() => {
    if (!open) return;
    setDraft(product ? inputFrom(product) : BLANK);
    reset();
  }, [open, product, reset]);

  const set = <K extends keyof ProductInput>(key: K, value: ProductInput[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));
  const errors = form.fieldErrors;
  const isPanel = draft.category === 'panel';
  const isRated = draft.category === 'inverter' || draft.category === 'battery';

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const body: ProductInput = {
      ...draft,
      wattageWp: isPanel ? draft.wattageWp : null,
      ratedW: isRated ? draft.ratedW : null,
      dcr: isPanel ? draft.dcr : false,
    };
    await form.run(
      () =>
        product
          ? expectStatus(api.catalog.updateProduct({ params: { id: product.id }, body }), 200)
          : expectStatus(api.catalog.createProduct({ body }), 201),
      async (saved) => {
        // The builder and other pickers keep their own product lists under ['catalog'].
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: SETTINGS_KEYS.products }),
          queryClient.invalidateQueries({ queryKey: ['catalog'] }),
        ]);
        const name = { name: saved.name };
        toast({
          title: product ? dialogT('updated', name) : dialogT('created', name),
          tone: 'success',
        });
        onClose();
      },
    );
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => !next && onClose()}
      title={product ? dialogT('editTitle') : dialogT('createTitle')}
      size="lg"
      autoFocusField
      footer={
        <Button type="submit" form={formId} variant="primary" pending={form.pending}>
          {product ? settingsT('save') : dialogT('create')}
        </Button>
      }
    >
      <form id={formId} onSubmit={submit} noValidate className="flex flex-col gap-5">
        <Field label={dialogT('name')} error={errors.name} required>
          <Input value={draft.name} onChange={(event) => set('name', event.target.value)} />
        </Field>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label={dialogT('brand')} error={errors.brand} required>
            <Input value={draft.brand} onChange={(event) => set('brand', event.target.value)} />
          </Field>
          <Field label={dialogT('sku')} error={errors.sku} required>
            <Input
              value={draft.sku}
              onChange={(event) => set('sku', event.target.value)}
              className="font-mono uppercase"
            />
          </Field>
          <Field label={dialogT('category')} error={errors.category}>
            <Select
              value={draft.category}
              onValueChange={(value) => set('category', value)}
              options={LINE_CATEGORIES.map((value) => ({ value, label: t(`categories.${value}`) }))}
              label={dialogT('category')}
            />
          </Field>
          <Field label={dialogT('unit')} error={errors.unit}>
            <UnitSelect
              value={draft.unit}
              onValueChange={(unit) => set('unit', unit)}
              label={dialogT('unit')}
            />
          </Field>
          {isPanel && (
            <Field label={dialogT('wattageWp')} error={errors.wattageWp} required>
              <NumberInput
                unit="whole"
                value={draft.wattageWp}
                onValueChange={(value) => set('wattageWp', value)}
              />
            </Field>
          )}
          {isRated && (
            <Field label={dialogT('ratedW')} error={errors.ratedW} required>
              <NumberInput
                unit="whole"
                value={draft.ratedW}
                onValueChange={(value) => set('ratedW', value)}
              />
            </Field>
          )}
        </div>
        {isPanel && (
          <Switch
            checked={draft.dcr}
            onCheckedChange={(value) => set('dcr', value)}
            label={dialogT('dcr')}
            description={dialogT('dcrHint')}
          />
        )}
        <div className="grid gap-5 sm:grid-cols-3">
          <Field label={dialogT('price')} error={errors.pricePaise}>
            <NumberInput
              unit="paise"
              value={draft.pricePaise}
              onValueChange={(value) => set('pricePaise', value ?? 0)}
            />
          </Field>
          <Field label={dialogT('cost')} error={errors.costPaise}>
            <NumberInput
              unit="paise"
              value={draft.costPaise}
              onValueChange={(value) => set('costPaise', value ?? 0)}
            />
          </Field>
          <Field label={dialogT('taxRate')} error={errors.taxRateBp}>
            <NumberInput
              unit="basisPoints"
              value={draft.taxRateBp}
              onValueChange={(value) => set('taxRateBp', value ?? 0)}
            />
          </Field>
        </div>
        <ProductSpecs draft={draft} set={set} errors={errors} product={product} />
        <Switch
          checked={draft.active}
          onCheckedChange={(value) => set('active', value)}
          label={dialogT('active')}
        />
        <FormError message={form.error} />
      </form>
    </Dialog>
  );
}
