'use client';

import { Button, IconButton, Input } from '@oneohm/design-system/web';
import { DEFAULT_TRANCHE_PATTERN, type PatternPart } from '@oneohm/domain';
import { Plus, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { usePercent } from './pattern-summary';

/** One part as it is being typed: the share stays text until it is saved. */
export interface PartDraft {
  readonly key: string;
  readonly label: string;
  readonly percent: string;
}

const MAX_PARTS = 6;
const ROW =
  'grid grid-cols-[minmax(0,1fr)_5.25rem_auto] items-center gap-1.5 sm:grid-cols-[minmax(0,1fr)_6.5rem_auto] sm:gap-2';

let counter = 0;
const draft = (label: string, percent: string): PartDraft => {
  counter += 1;
  return { key: `part-${counter}`, label, percent };
};

/** The lender's saved parts to edit, or the shipped 70 / 30 split when it has none. */
export const partsFromPattern = (saved: readonly PatternPart[]): PartDraft[] =>
  (saved.length > 0 ? saved : DEFAULT_TRANCHE_PATTERN).map((part) =>
    draft(part.label, String(part.shareBp / 100)),
  );

/** Percent text to basis points: "33.33" → 3333. Blank or unreadable counts as 0. */
const toBp = (percent: string) => {
  const value = Number(percent);
  return Number.isFinite(value) ? Math.round(value * 100) : 0;
};

export const partsToPattern = (parts: readonly PartDraft[]): PatternPart[] =>
  parts.map((part) => ({ label: part.label.trim(), shareBp: toBp(part.percent) }));

/** A parts lender's split: each part's name and share, with a running total. */
export function LenderPatternEditor({
  parts,
  onChange,
  error,
}: {
  readonly parts: readonly PartDraft[];
  readonly onChange: (parts: PartDraft[]) => void;
  readonly error?: string | undefined;
}) {
  const t = useTranslations('finance.loans.lendersDialog.parts');
  const percent = usePercent();
  const totalBp = parts.reduce((sum, part) => sum + toBp(part.percent), 0);
  const update = (index: number, patch: Partial<PartDraft>) =>
    onChange(parts.map((part, at) => (at === index ? { ...part, ...patch } : part)));

  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="type-label text-ink">{t('title')}</legend>
      <p className="mb-1 type-body-sm text-ink-muted">{t('hint')}</p>
      <div className={`${ROW} type-body-sm text-ink-faint`} aria-hidden>
        <span>{t('name')}</span>
        <span>{t('share')}</span>
        <span className="w-9 pointer-coarse:w-11" />
      </div>
      {parts.map((part, index) => (
        <div key={part.key} className={ROW}>
          <Input
            aria-label={t('name')}
            value={part.label}
            maxLength={60}
            onChange={(event) => update(index, { label: event.target.value })}
          />
          <Input
            aria-label={t('share')}
            inputMode="decimal"
            value={part.percent}
            className="pr-7 font-mono"
            trailing={<span className="type-body text-ink-faint">%</span>}
            onChange={(event) =>
              update(index, { percent: event.target.value.replace(/[^\d.]/g, '') })
            }
          />
          <IconButton
            label={t('remove')}
            size="sm"
            disabled={parts.length <= 1}
            onClick={() => onChange(parts.filter((_, at) => at !== index))}
          >
            <X aria-hidden />
          </IconButton>
        </div>
      ))}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p
          aria-live="polite"
          className={`type-body-sm ${totalBp === 10_000 ? 'text-ink-muted' : 'text-at-risk'}`}
        >
          {t(totalBp === 10_000 ? 'total' : 'totalOff', { total: percent(totalBp) })}
        </p>
        <Button
          type="button"
          size="sm"
          variant="quiet"
          leadingIcon={<Plus />}
          disabled={parts.length >= MAX_PARTS}
          onClick={() => onChange([...parts, draft('', '')])}
        >
          {t('add')}
        </Button>
      </div>
      {error && <p className="type-body-sm text-overdue">{error}</p>}
    </fieldset>
  );
}
