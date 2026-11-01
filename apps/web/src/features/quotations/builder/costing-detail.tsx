'use client';

import type { CostingDetailInput, QuotationCosting } from '@oneohm/api-contracts';
import { Badge, cn, Field, Input } from '@oneohm/design-system/web';
import { ChevronRight } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import type { BuilderState } from './builder-state';
import { DetailLabour } from './detail-labour';
import { DetailRuns } from './detail-runs';
import { DetailStructure } from './detail-structure';

type Detail = CostingDetailInput;
type Patch = (patch: Partial<BuilderState>) => void;

/** Drops parts left empty, so an untouched detail stays "site-type defaults". */
function cleaned(detail: Detail): Detail | null {
  const entries = Object.entries(detail).filter(([, value]) => value !== undefined && value !== '');
  return entries.length === 0 ? null : (Object.fromEntries(entries) as Detail);
}

/**
 * The detail behind a quick quote (PRD 3.9), closed until someone opens it: cable runs
 * floor by floor, the structure as it will be built, crew, days, visits, site access
 * and equipment. It shows what the engine assumed; changing anything makes that part
 * measured, and "Use defaults" hands it back to the site type.
 */
export function CostingDetail({
  state,
  patch,
  costing,
}: {
  readonly state: BuilderState;
  readonly patch: Patch;
  readonly costing: QuotationCosting | undefined;
}) {
  const t = useTranslations('costing.detail');
  const [open, setOpen] = useState(state.costing !== null);
  const detail: Detail = state.costing ?? {};
  const set = (next: Partial<Detail>) => patch({ costing: cleaned({ ...detail, ...next }) });
  const used = costing?.used;
  const rates = costing?.rates ?? [];

  return (
    <div className="flex flex-col gap-4">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex items-center gap-2 self-start type-body-sm font-medium text-accent hover:underline"
      >
        <ChevronRight
          aria-hidden
          className={cn('size-4 transition-transform', open && 'rotate-90')}
        />
        {t('toggle')}
        {state.costing && <Badge variant="energy">{t('measured')}</Badge>}
      </button>
      {open && !used && <p className="type-body-sm text-ink-faint">{t('waiting')}</p>}
      {open && used && (
        <div className="flex flex-col gap-6 rounded-2xl border border-hairline bg-raised p-4 sm:p-5">
          <p className="type-body-sm text-ink-muted">{t('intro')}</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('arrayLocation')}>
              <Input
                value={detail.arrayLocation ?? ''}
                placeholder={t('arrayPlaceholder')}
                onChange={(event) => set({ arrayLocation: event.target.value })}
              />
            </Field>
            <Field label={t('inverterLocation')}>
              <Input
                value={detail.inverterLocation ?? ''}
                placeholder={t('inverterPlaceholder')}
                onChange={(event) => set({ inverterLocation: event.target.value })}
              />
            </Field>
          </div>
          <DetailRuns detail={detail} used={used} rates={rates} set={set} />
          <DetailStructure detail={detail} used={used} rates={rates} set={set} />
          <DetailLabour detail={detail} used={used} rates={rates} set={set} />
        </div>
      )}
    </div>
  );
}
