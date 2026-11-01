'use client';

import type { CostingDetailInput, QuotationCosting } from '@oneohm/api-contracts';
import { Badge, Button } from '@oneohm/design-system/web';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import type { RateOption } from '@/features/settings/rates/list-editor';

/** What every part of a quotation's detail gets: its own detail, what was used, the rates. */
export interface DetailPartProps {
  readonly detail: CostingDetailInput;
  readonly used: NonNullable<QuotationCosting['used']>;
  readonly rates: readonly RateOption[];
  readonly set: (next: Partial<CostingDetailInput>) => void;
}

/** One part of the detail, with a way back to the site type's defaults once changed. */
export function DetailBlock({
  title,
  hint,
  changed,
  onReset,
  children,
}: {
  readonly title: string;
  readonly hint: string;
  readonly changed: boolean;
  readonly onReset: () => void;
  readonly children: ReactNode;
}) {
  const t = useTranslations('costing.detail');
  return (
    <section className="flex flex-col gap-4 border-t border-hairline pt-5 first:border-t-0 first:pt-0">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h4 className="flex items-center gap-2 type-title-md text-ink">
            {title}
            <Badge variant={changed ? 'energy' : 'outline'}>
              {changed ? t('measured') : t('defaults')}
            </Badge>
          </h4>
          <p className="type-body-sm text-ink-faint">{hint}</p>
        </div>
        {changed && (
          <Button variant="quiet" size="sm" onClick={onReset}>
            {t('reset')}
          </Button>
        )}
      </div>
      {children}
    </section>
  );
}
