'use client';

import { Button, Field, IconButton } from '@oneohm/design-system/web';
import { formatKwp } from '@oneohm/shared';
import { Plus, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { NumberInput } from '../number-input';
import { KwInput } from './kw-input';
import { type SlabDraft, slabStart } from './subsidy-rule-draft';

/** Slab rows with the server's field errors (`slabs.1.toWp`) under the right input. */
export function SubsidySlabsEditor({
  slabs,
  onChange,
  errors,
}: {
  readonly slabs: readonly SlabDraft[];
  readonly onChange: (slabs: SlabDraft[]) => void;
  readonly errors: Readonly<Record<string, string>>;
}) {
  const t = useTranslations('settings.subsidy.form');
  const update = (index: number, patch: Partial<SlabDraft>) =>
    onChange(slabs.map((slab, at) => (at === index ? { ...slab, ...patch } : slab)));
  const add = () => {
    const last = slabs[slabs.length - 1];
    const start = last ? (last.toWp ?? slabStart(slabs, slabs.length - 1) + 1000) : 0;
    const ended = slabs.map((slab, at) =>
      at === slabs.length - 1 && slab.toWp === null ? { ...slab, toWp: start } : slab,
    );
    onChange([...ended, { toWp: null, paisePerKw: null }]);
  };

  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="type-label text-ink">{t('slabs')}</legend>
      <p className="-mt-1 type-body-sm text-ink-faint">{t('slabsHint')}</p>
      {slabs.length === 0 && <p className="type-body-sm text-ink-muted">{t('noSlabs')}</p>}
      <ol className="flex flex-col gap-3">
        {slabs.map((slab, index) => {
          const number = index + 1;
          const startError = errors[`slabs.${index}.fromWp`];
          return (
            <li
              // Slabs have no identity of their own; position is what the errors use too.
              key={index}
              className="flex flex-col gap-2 rounded-xl border border-hairline bg-raised p-3"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="type-body-sm text-ink-muted">
                  <span className="font-medium text-ink">{t('slabLabel', { number })}</span>
                  {' · '}
                  {t('slabFrom', { from: formatKwp(slabStart(slabs, index)) })}
                </p>
                <IconButton
                  label={t('removeSlab', { number })}
                  size="sm"
                  onClick={() => onChange(slabs.filter((_, at) => at !== index))}
                >
                  <Trash2 aria-hidden />
                </IconButton>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label={t('upTo')} error={errors[`slabs.${index}.toWp`]}>
                  <KwInput
                    value={slab.toWp}
                    placeholder={t('noLimit')}
                    onValueChange={(toWp) => update(index, { toWp })}
                  />
                </Field>
                <Field label={t('rate')} error={errors[`slabs.${index}.paisePerKw`]}>
                  <NumberInput
                    unit="paise"
                    value={slab.paisePerKw}
                    onValueChange={(paisePerKw) => update(index, { paisePerKw })}
                  />
                </Field>
              </div>
              {startError && <p className="type-body-sm text-overdue">{startError}</p>}
            </li>
          );
        })}
      </ol>
      {errors.slabs && <p className="type-body-sm text-overdue">{errors.slabs}</p>}
      <Button
        type="button"
        variant="secondary"
        size="sm"
        leadingIcon={<Plus />}
        onClick={add}
        className="self-start"
      >
        {t('addSlab')}
      </Button>
    </fieldset>
  );
}
