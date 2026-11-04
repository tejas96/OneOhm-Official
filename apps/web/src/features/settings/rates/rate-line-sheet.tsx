'use client';

import type { RateCardValues } from '@oneohm/api-contracts';
import {
  Button,
  Dialog,
  Field,
  Input,
  SegmentedControl,
  Select,
  Sheet,
} from '@oneohm/design-system/web';
import { type CostingCard, MATERIAL_KINDS, RATE_KINDS, rateUses } from '@oneohm/domain';
import { formatInr } from '@oneohm/shared';
import { useTranslations } from 'next-intl';
import { type FormEvent, useEffect, useId, useState } from 'react';
import { FormError } from '@/components/form-error';
import { UnitSelect } from '@/components/unit-select';
import { NumberInput } from '../number-input';
import { useAllProducts } from '../use-settings';
import { keyFor, useCardSaver } from './use-card-saver';

type RateLine = RateCardValues['rateLines'][number];
const NONE = 'none';

const BLANK: RateLine = {
  key: '',
  label: '',
  kind: 'structure',
  unit: 'nos',
  pricePaise: 0,
  costPaise: 0,
  tax: 'goods',
  productId: null,
};

/** Add or edit one rate line; `line` null with `open` adds. */
export function RateLineSheet({
  card,
  open,
  line,
  onClose,
}: {
  readonly card: RateCardValues;
  readonly open: boolean;
  readonly line: RateLine | null;
  readonly onClose: () => void;
}) {
  const t = useTranslations('costing.lines.sheet');
  const kindT = useTranslations('costing.kinds');
  const commonT = useTranslations('costing.common');
  const formId = useId();
  const products = useAllProducts();
  const { save, form } = useCardSaver();
  const [draft, setDraft] = useState<RateLine>(BLANK);
  const [deleting, setDeleting] = useState(false);
  const { reset } = form;

  useEffect(() => {
    if (!open) return;
    setDraft(line ?? BLANK);
    setDeleting(false);
    reset();
  }, [open, line, reset]);

  const index = line
    ? card.rateLines.findIndex((entry) => entry.key === line.key)
    : card.rateLines.length;
  const error = (field: string) => form.fieldErrors[`rateLines.${index}.${field}`];
  const set = <K extends keyof RateLine>(key: K, value: RateLine[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));
  const stock = MATERIAL_KINDS.includes(draft.kind);
  const product = products.data?.find((entry) => entry.id === draft.productId);
  const uses = line ? rateUses(card as CostingCard, line.key).length : 0;

  const persist = async (rateLines: RateLine[]) => {
    if (await save({ ...card, rateLines })) onClose();
  };
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const next = { ...draft, productId: stock ? draft.productId : null };
    if (line) {
      await persist(card.rateLines.map((entry) => (entry.key === line.key ? next : entry)));
      return;
    }
    const key = keyFor(
      next.label,
      card.rateLines.map((entry) => entry.key),
    );
    await persist([...card.rateLines, { ...next, key }]);
  };

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => !next && onClose()}
      title={line ? t('editTitle') : t('addTitle')}
      description={t('description')}
      autoFocusField
      footer={
        <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:px-6">
          <FormError message={form.error} />
          {line && (
            <Button
              variant="danger"
              disabled={uses > 0}
              pending={form.pending}
              onClick={() => setDeleting(true)}
            >
              {t('delete')}
            </Button>
          )}
          <Button
            variant="primary"
            type="submit"
            form={formId}
            pending={form.pending}
            className="sm:ml-auto"
          >
            {commonT('save')}
          </Button>
        </div>
      }
    >
      <form
        id={formId}
        onSubmit={submit}
        noValidate
        className="flex flex-col gap-5 px-5 py-6 sm:px-6"
      >
        <Field label={t('label')} hint={t('labelHint')} error={error('label')} required>
          <Input value={draft.label} onChange={(event) => set('label', event.target.value)} />
        </Field>
        <Field label={t('kind')} hint={t('kindHint')}>
          <Select
            value={draft.kind}
            onValueChange={(kind) => set('kind', kind)}
            options={RATE_KINDS.map((value) => ({ value, label: kindT(value) }))}
          />
        </Field>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label={t('unit')} hint={t('unitHint')} error={error('unit')} required>
            <UnitSelect
              value={draft.unit}
              onValueChange={(unit) => set('unit', unit)}
              label={t('unit')}
            />
          </Field>
          <Field label={t('tax')}>
            <SegmentedControl
              label={t('tax')}
              value={draft.tax}
              onValueChange={(tax) => set('tax', tax)}
              options={[
                { value: 'goods', label: t('goods') },
                { value: 'service', label: t('service') },
              ]}
              className="w-full [&>*]:flex-1"
            />
          </Field>
        </div>
        {stock && (
          <Field label={t('product')} hint={t('productHint')} error={error('productId')}>
            <Select
              value={draft.productId ?? NONE}
              onValueChange={(value) => set('productId', value === NONE ? null : value)}
              options={[
                { value: NONE, label: t('noProduct') },
                ...(products.data ?? [])
                  .filter((entry) => entry.active || entry.id === draft.productId)
                  .map((entry) => ({ value: entry.id, label: `${entry.name} · ${entry.sku}` })),
              ]}
            />
          </Field>
        )}
        {stock && product ? (
          <p className="rounded-lg bg-sunken px-3 py-2.5 type-body-sm text-ink-muted">
            {t('catalogPrice', {
              price: formatInr(product.pricePaise),
              cost: formatInr(product.costPaise),
              unit: product.unit,
            })}
          </p>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label={t('price')} error={error('pricePaise')}>
              <NumberInput
                unit="paise"
                value={draft.pricePaise}
                onValueChange={(value) => set('pricePaise', value ?? 0)}
              />
            </Field>
            <Field label={t('cost')} error={error('costPaise')}>
              <NumberInput
                unit="paise"
                value={draft.costPaise}
                onValueChange={(value) => set('costPaise', value ?? 0)}
              />
            </Field>
          </div>
        )}
        {uses > 0 && <p className="type-body-sm text-ink-faint">{t('inUse', { count: uses })}</p>}
      </form>
      <Dialog
        open={deleting && line !== null}
        onOpenChange={setDeleting}
        title={t('deleteTitle', { label: line?.label ?? '' })}
        size="sm"
        footer={
          <>
            <Button variant="quiet" onClick={() => setDeleting(false)}>
              {t('keep')}
            </Button>
            <Button
              variant="danger"
              pending={form.pending}
              onClick={async () => {
                setDeleting(false);
                if (line) await persist(card.rateLines.filter((entry) => entry.key !== line.key));
              }}
            >
              {t('delete')}
            </Button>
          </>
        }
      >
        <p className="type-body-sm text-ink-muted">{t('deleteBody')}</p>
      </Dialog>
    </Sheet>
  );
}
