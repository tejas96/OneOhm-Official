'use client';

import { Field, Input, SegmentedControl } from '@oneohm/design-system/web';
import { useTranslations } from 'next-intl';
import { type ExtraDraft, type ExtraDraftError, takesCost, takesPrice } from './extra-line-draft';

const decimal = (text: string) => text.replace(/[^\d.]/g, '');

/** Quantity, price and cost for a hand-added line; an adjustment takes a direction and an amount. */
export function AmountFields({
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
