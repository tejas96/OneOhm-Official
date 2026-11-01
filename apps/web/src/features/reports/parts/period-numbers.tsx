'use client';

import type { ReportMeta } from '@oneohm/api-contracts';
import { Button } from '@oneohm/design-system/web';
import { ChevronDown } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useId, useState } from 'react';
import { NUM } from './report-body';
import { useBucketNames } from './report-format';

export interface PeriodColumn<T> {
  readonly header: string;
  readonly cell: (row: T) => string | number;
}

/** A chart's numbers per week or month as a plain table, one press away. */
export function PeriodNumbers<T extends { start: string; end: string }>({
  caption,
  rows,
  columns,
  granularity,
}: {
  readonly caption: string;
  readonly rows: readonly T[];
  readonly columns: readonly PeriodColumn<T>[];
  readonly granularity: ReportMeta['granularity'];
}) {
  const t = useTranslations('businessReports.numbers');
  const names = useBucketNames(granularity);
  const [open, setOpen] = useState(false);
  const id = useId();
  const cell = 'border-b border-hairline px-3 py-2';
  return (
    <div className="flex flex-col gap-2">
      <Button
        variant="quiet"
        size="sm"
        className="self-start"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((value) => !value)}
        trailingIcon={
          <ChevronDown aria-hidden className={open ? 'rotate-180 transition' : 'transition'} />
        }
      >
        {open ? t('hide') : t('show')}
      </Button>
      {open && (
        <div id={id} className="overflow-x-auto">
          <table className="w-full min-w-[28rem] border-collapse type-body-sm">
            <caption className="sr-only">{caption}</caption>
            <thead>
              <tr className="text-left text-ink-muted">
                <th scope="col" className={`${cell} font-medium`}>
                  {t('period')}
                </th>
                {columns.map((column) => (
                  <th key={column.header} scope="col" className={`${cell} text-right font-medium`}>
                    {column.header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.start}>
                  <th scope="row" className={`${cell} text-left font-normal text-ink`}>
                    {names.name(row)}
                  </th>
                  {columns.map((column) => (
                    <td key={column.header} className={`${cell} text-right text-ink ${NUM}`}>
                      {column.cell(row)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
