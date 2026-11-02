'use client';

import type { ExtraLineInput, Product } from '@oneohm/api-contracts';
import {
  Button,
  Field,
  Input,
  SearchSelect,
  SegmentedControl,
  Sheet,
  Textarea,
} from '@oneohm/design-system/web';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { type FormEvent, useEffect, useId, useState } from 'react';
import { productOptions, useSearchWords } from '@/components/product-search';
import { api, expectStatus } from '@/lib/api/api-client';
import {
  EMPTY_EXTRA,
  EXTRA_KINDS,
  type ExtraDraft,
  type ExtraDraftError,
  extraFromDraft,
  takesCost,
  takesPrice,
  takesProduct,
  takesReason,
  withProduct,
} from './extra-line-draft';

const NO_PRODUCT = 'typed';
const decimal = (text: string) => text.replace(/[^\d.]/g, '');

/** Every product on sale, for optional items and gifts. */
function useActiveProducts() {
  return useQuery({
    queryKey: ['catalog', 'active-products'],
    queryFn: () => expectStatus(api.catalog.listProducts({ query: {} }), 200),
    staleTime: 5 * 60_000,
  });
}

/**
 * Add a line by hand (PRD 3.5, 3.9): an optional item the customer may add, a gift,
 * a site-specific charge, or a price adjustment. Each needs a reason except an
 * optional item; a lower price counts toward the discount limit.
 */
export function ExtraLineSheet({
  open,
  onClose,
  onAdd,
}: {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly onAdd: (line: ExtraLineInput) => void;
}) {
  const t = useTranslations('quotations.extras');
  const formId = useId();
  const products = useActiveProducts();
  const words = useSearchWords();
  const [draft, setDraft] = useState<ExtraDraft>(EMPTY_EXTRA);
  const [errors, setErrors] = useState<readonly ExtraDraftError[]>([]);
  useEffect(() => {
    if (!open) return;
    setDraft(EMPTY_EXTRA);
    setErrors([]);
  }, [open]);

  const patch = (next: Partial<ExtraDraft>) => setDraft((current) => ({ ...current, ...next }));
  const error = (field: ExtraDraftError) =>
    errors.includes(field) ? t(`errors.${field}`) : undefined;
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const result = extraFromDraft(draft);
    if ('errors' in result) {
      setErrors(result.errors);
      return;
    }
    onAdd(result.line);
    onClose();
  };
  const kind = draft.kind;
  const picked = draft.productId !== null && takesProduct(kind);
  return (
    <Sheet
      open={open}
      onOpenChange={(next) => !next && onClose()}
      title={t('sheetTitle')}
      description={t('sheetDescription')}
      footer={
        <div className="flex w-full justify-end gap-2">
          <Button variant="quiet" onClick={onClose}>
            {t('cancel')}
          </Button>
          <Button type="submit" form={formId} variant="primary">
            {t('add')}
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
        <Field label={t('kind')} hint={t(`kindHint.${kind}`)}>
          <SegmentedControl
            label={t('kind')}
            value={kind}
            onValueChange={(value) => patch({ kind: value })}
            options={EXTRA_KINDS.map((value) => ({ value, label: t(`kinds.${value}`) }))}
            className="w-full [&>*]:flex-1"
            size="sm"
          />
        </Field>
        {takesProduct(kind) && (
          <Field label={t('product')} hint={t('productHint')}>
            <SearchSelect
              {...words}
              label={t('product')}
              value={draft.productId ?? NO_PRODUCT}
              onValueChange={(value) =>
                setDraft((current) =>
                  withProduct(
                    current,
                    products.data?.find((row: Product) => row.id === value),
                  ),
                )
              }
              options={[
                { value: NO_PRODUCT, label: t('typed') },
                ...productOptions(products.data ?? []),
              ]}
            />
          </Field>
        )}
        <Field label={t('description')} error={error('description')} required>
          <Input
            value={draft.description}
            disabled={picked}
            onChange={(event) => patch({ description: event.target.value })}
          />
        </Field>
        <AmountFields draft={draft} picked={picked} patch={patch} error={error} />
        {takesReason(kind) && (
          <Field
            label={t('reason')}
            hint={t(`reasonHint.${kind}`)}
            error={error('reason')}
            required
          >
            <Textarea
              rows={2}
              value={draft.reason}
              onChange={(event) => patch({ reason: event.target.value })}
            />
          </Field>
        )}
      </form>
    </Sheet>
  );
}

function AmountFields({
  draft,
  picked,
  patch,
  error,
}: {
  readonly draft: ExtraDraft;
  readonly picked: boolean;
  readonly patch: (next: Partial<ExtraDraft>) => void;
  readonly error: (field: ExtraDraftError) => string | undefined;
}) {
  const t = useTranslations('quotations.extras');
  const rupee = <span className="type-body text-ink-faint">₹</span>;
  if (draft.kind === 'adjustment') {
    // Stacked: side by side, "Lower the price" wraps inside its half-width switch.
    return (
      <div className="flex flex-col gap-5">
        <Field label={t('direction')}>
          <SegmentedControl
            label={t('direction')}
            value={draft.lowers ? 'lower' : 'raise'}
            onValueChange={(value) => patch({ lowers: value === 'lower' })}
            options={[
              { value: 'lower', label: t('lower') },
              { value: 'raise', label: t('raise') },
            ]}
            className="w-full [&>*]:flex-1"
            size="sm"
          />
        </Field>
        <Field
          label={t('amount')}
          hint={t('amountHint')}
          error={error('price')}
          required
          className="sm:max-w-[calc(50%-0.625rem)]"
        >
          <Input
            inputMode="decimal"
            value={draft.price}
            onChange={(event) => patch({ price: decimal(event.target.value) })}
            leading={rupee}
            className="font-mono"
          />
        </Field>
      </div>
    );
  }
  // Each field spans the same three rows (label, input, note), so a label that wraps
  // to two lines never pushes its input below the others.
  const cell = 'sm:row-span-3 sm:grid sm:grid-rows-subgrid sm:gap-1.5';
  return (
    <div className="grid gap-5 sm:grid-cols-3 sm:gap-y-0">
      <Field label={t('quantity')} error={error('quantity')} required className={cell}>
        <Input
          inputMode="decimal"
          value={draft.quantity}
          onChange={(event) => patch({ quantity: decimal(event.target.value) })}
          className="font-mono"
        />
      </Field>
      {takesPrice(draft.kind) && (
        <Field label={t('price')} error={error('price')} className={cell}>
          <Input
            inputMode="decimal"
            value={draft.price}
            disabled={picked}
            onChange={(event) => patch({ price: decimal(event.target.value) })}
            leading={rupee}
            className="font-mono"
          />
        </Field>
      )}
      {takesCost(draft.kind) && (
        <Field label={t('cost')} error={error('cost')} className={cell}>
          <Input
            inputMode="decimal"
            value={draft.cost}
            disabled={picked}
            onChange={(event) => patch({ cost: decimal(event.target.value) })}
            leading={rupee}
            className="font-mono"
          />
        </Field>
      )}
    </div>
  );
}
