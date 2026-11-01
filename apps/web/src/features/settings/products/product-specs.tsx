'use client';

import type { Product, ProductInput } from '@oneohm/api-contracts';
import { Field, Input, useToast } from '@oneohm/design-system/web';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { FileText, LoaderCircle, Upload } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { describeError } from '@/lib/api/api-error';
import { documentUrl, uploadProductDatasheet } from '@/lib/api/upload';
import { NumberInput } from '../number-input';
import { SETTINGS_KEYS } from '../use-settings';

type Set = <K extends keyof ProductInput>(key: K, value: ProductInput[K]) => void;

/**
 * Specifications printed briefly on quotations (PRD 3.5): efficiency, technology and
 * warranty, plus the maker's datasheet once the product is saved.
 */
export function ProductSpecs({
  draft,
  set,
  errors,
  product,
}: {
  readonly draft: ProductInput;
  readonly set: Set;
  readonly errors: Readonly<Record<string, string>>;
  readonly product: Product | null;
}) {
  const t = useTranslations('settings.products.dialog');
  return (
    <fieldset className="flex flex-col gap-4 border-t border-hairline pt-5">
      <legend className="pb-1 type-label font-medium text-ink">{t('specs')}</legend>
      <div className="grid gap-5 sm:grid-cols-3">
        <Field label={t('efficiency')} hint={t('efficiencyHint')} error={errors.efficiencyBp}>
          <NumberInput
            unit="basisPoints"
            value={draft.efficiencyBp ?? null}
            onValueChange={(value) => set('efficiencyBp', value)}
          />
        </Field>
        <Field label={t('technology')} hint={t('technologyHint')} error={errors.technology}>
          <Input
            value={draft.technology ?? ''}
            onChange={(event) => set('technology', event.target.value || null)}
          />
        </Field>
        <Field label={t('warrantyYears')} error={errors.warrantyYears}>
          <NumberInput
            unit="whole"
            value={draft.warrantyYears ?? null}
            onValueChange={(value) => set('warrantyYears', value)}
          />
        </Field>
      </div>
      {product ? (
        <Datasheet product={product} />
      ) : (
        <p className="type-body-sm text-ink-faint">{t('datasheetLater')}</p>
      )}
    </fieldset>
  );
}

function Datasheet({ product }: { readonly product: Product }) {
  const t = useTranslations('settings.products.dialog');
  const toast = useToast();
  const client = useQueryClient();
  const upload = useMutation({
    mutationFn: (file: File) => uploadProductDatasheet(product.id, file),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: SETTINGS_KEYS.products });
      toast({ tone: 'success', title: t('datasheetSaved') });
    },
    onError: (error) =>
      toast({ tone: 'error', title: t('datasheetFailed'), description: describeError(error) }),
  });
  const sheet = upload.data?.datasheet ?? product.datasheet ?? null;
  return (
    <div className="flex flex-wrap items-center gap-3">
      {sheet ? (
        <a
          href={documentUrl(sheet.id)}
          target="_blank"
          rel="noreferrer"
          className="inline-flex min-w-0 items-center gap-2 type-body-sm text-accent hover:underline"
        >
          <FileText aria-hidden className="size-4 shrink-0" />
          <span className="truncate">{sheet.name}</span>
        </a>
      ) : (
        <span className="type-body-sm text-ink-faint">{t('noDatasheet')}</span>
      )}
      <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-hairline px-3 py-1.5 type-label font-medium text-ink hover:border-accent focus-within:outline-2 focus-within:outline-focus">
        {upload.isPending ? (
          <LoaderCircle aria-hidden className="size-3.5 animate-spin" />
        ) : (
          <Upload aria-hidden className="size-3.5" />
        )}
        {sheet ? t('replaceDatasheet') : t('uploadDatasheet')}
        <input
          type="file"
          accept="application/pdf,image/png,image/jpeg,image/webp"
          className="sr-only"
          disabled={upload.isPending}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) upload.mutate(file);
            event.target.value = '';
          }}
        />
      </label>
    </div>
  );
}
