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
import { AmountFields } from './extra-line-amount-fields';
import {
  EMPTY_EXTRA,
  EXTRA_KINDS,
  type ExtraDraft,
  type ExtraDraftError,
  extraFromDraft,
  takesProduct,
  takesReason,
  withProduct,
} from './extra-line-draft';

const NO_PRODUCT = 'typed';

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
