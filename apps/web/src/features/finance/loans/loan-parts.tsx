'use client';

import { Button, Checkbox, Field, Input } from '@oneohm/design-system/web';
import { Plus, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { NumberInput } from '../../settings/number-input';

export interface DocumentDraft {
  readonly name: string;
  readonly received: boolean;
}

export interface TrancheDraft {
  readonly key: string;
  readonly id: string | null;
  readonly label: string;
  readonly amountPaise: number | null;
  readonly expectedOn: string;
  readonly claimed: boolean;
  readonly received: boolean;
}

/** The lender's document list, ticked off as each one arrives. */
export function DocumentChecklist({
  documents,
  onChange,
}: {
  readonly documents: readonly DocumentDraft[];
  readonly onChange: (documents: DocumentDraft[]) => void;
}) {
  const t = useTranslations('finance.loans.sheet');
  const [name, setName] = useState('');
  const add = () => {
    const trimmed = name.trim();
    if (!trimmed || documents.some((document) => document.name === trimmed)) return;
    onChange([...documents, { name: trimmed, received: false }]);
    setName('');
  };
  return (
    <div className="flex flex-col gap-1">
      {documents.map((document, index) => (
        <div key={document.name} className="flex items-center justify-between gap-2">
          <Checkbox
            checked={document.received}
            label={document.name}
            onCheckedChange={(received) =>
              onChange(
                documents.map((entry, at) => (at === index ? { ...entry, received } : entry)),
              )
            }
          />
          <button
            type="button"
            title={t('removeDocument')}
            onClick={() => onChange(documents.filter((_, at) => at !== index))}
            className="flex size-8 items-center justify-center rounded-md text-ink-faint hover:bg-sunken hover:text-ink"
          >
            <X aria-hidden className="size-4" />
            <span className="sr-only">{t('removeDocument')}</span>
          </button>
        </div>
      ))}
      <div className="flex items-end gap-2">
        <Field label={t('newDocument')} className="flex-1">
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                add();
              }
            }}
          />
        </Field>
        <Button type="button" variant="secondary" leadingIcon={<Plus />} onClick={add}>
          {t('addDocument')}
        </Button>
      </div>
    </div>
  );
}

let counter = 0;
export const newTranche = (amountPaise: number | null): TrancheDraft => {
  counter += 1;
  return {
    key: `new-${counter}`,
    id: null,
    label: '',
    amountPaise,
    expectedOn: '',
    claimed: false,
    received: false,
  };
};

/** Planned parts of the bank's disbursement. Received ones are history and stay fixed. */
export function TrancheEditor({
  tranches,
  onChange,
  remainingPaise,
  error,
}: {
  readonly tranches: readonly TrancheDraft[];
  readonly onChange: (tranches: TrancheDraft[]) => void;
  readonly remainingPaise: number;
  readonly error?: string | undefined;
}) {
  const t = useTranslations('finance.loans.sheet');
  const update = (index: number, patch: Partial<TrancheDraft>) =>
    onChange(tranches.map((entry, at) => (at === index ? { ...entry, ...patch } : entry)));
  return (
    <div className="flex flex-col gap-3">
      {tranches.map((tranche, index) => (
        <div
          key={tranche.key}
          className="grid gap-3 rounded-lg p-3 ring-1 ring-hairline sm:grid-cols-[1fr_9rem_9rem_auto] sm:items-end"
        >
          <Field label={t('trancheLabel')}>
            <Input
              value={tranche.label}
              disabled={tranche.received}
              onChange={(event) => update(index, { label: event.target.value })}
            />
          </Field>
          <Field label={t('trancheAmount')}>
            <NumberInput
              unit="paise"
              value={tranche.amountPaise}
              disabled={tranche.received}
              onValueChange={(amountPaise) => update(index, { amountPaise })}
            />
          </Field>
          <Field label={t('expectedOn')}>
            <Input
              type="date"
              value={tranche.expectedOn}
              disabled={tranche.received}
              onChange={(event) => update(index, { expectedOn: event.target.value })}
            />
          </Field>
          <div className="flex items-center gap-1">
            {tranche.received ? (
              <span className="px-2 pb-2 type-label text-done">{t('received')}</span>
            ) : (
              <>
                <Checkbox
                  checked={tranche.claimed}
                  label={t('claimed')}
                  onCheckedChange={(claimed) => update(index, { claimed })}
                />
                <button
                  type="button"
                  title={t('removeTranche')}
                  onClick={() => onChange(tranches.filter((_, at) => at !== index))}
                  className="flex size-8 items-center justify-center rounded-md text-ink-faint hover:bg-sunken hover:text-ink"
                >
                  <X aria-hidden className="size-4" />
                  <span className="sr-only">{t('removeTranche')}</span>
                </button>
              </>
            )}
          </div>
        </div>
      ))}
      {error && <p className="type-body-sm text-overdue">{error}</p>}
      <Button
        type="button"
        variant="quiet"
        leadingIcon={<Plus />}
        className="self-start"
        onClick={() =>
          onChange([...tranches, newTranche(remainingPaise > 0 ? remainingPaise : null)])
        }
      >
        {t('addTranche')}
      </Button>
    </div>
  );
}
