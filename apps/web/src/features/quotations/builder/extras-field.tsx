'use client';

import type { ExtraLineInput } from '@oneohm/api-contracts';
import { Badge, Button, IconButton } from '@oneohm/design-system/web';
import { formatInr } from '@oneohm/shared';
import { Plus, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { ExtraLineSheet } from './extra-line-sheet';

/** What one hand-added line comes to, as sales sees it while building. */
function shownAmount(line: ExtraLineInput): number {
  return Math.round(line.quantity * line.unitPricePaise);
}

/**
 * Optional items, gifts, site charges and adjustments (PRD 3.5, 3.9). Each is added
 * whole from a side sheet, so the live price never breaks while typing.
 */
export function ExtrasField({
  extras,
  onChange,
}: {
  readonly extras: readonly ExtraLineInput[];
  readonly onChange: (extras: readonly ExtraLineInput[]) => void;
}) {
  const t = useTranslations('quotations.extras');
  const [adding, setAdding] = useState(false);
  return (
    <div className="flex flex-col gap-4">
      {extras.length === 0 ? (
        <p className="type-body-sm text-ink-faint">{t('none')}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-hairline rounded-xl border border-hairline bg-raised">
          {extras.map((line, index) => (
            <li
              key={`${index}-${line.kind}-${line.description}`}
              className="flex items-start gap-3 px-4 py-3"
            >
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="flex flex-wrap items-center gap-2">
                  <Badge variant="soft" className="py-0">
                    {t(`kinds.${line.kind}`)}
                  </Badge>
                  <span className="type-body text-ink">{line.description}</span>
                </span>
                {line.reason && <span className="type-body-sm text-ink-faint">{line.reason}</span>}
              </div>
              <span className="shrink-0 type-body text-ink tabular-nums">
                {line.kind === 'gift' ? t('free') : formatSigned(shownAmount(line))}
              </span>
              <IconButton
                label={t('remove', { item: line.description })}
                size="sm"
                variant="quiet"
                onClick={() => onChange(extras.filter((_, at) => at !== index))}
              >
                <X />
              </IconButton>
            </li>
          ))}
        </ul>
      )}
      <Button
        variant="secondary"
        size="sm"
        leadingIcon={<Plus />}
        className="self-start"
        disabled={extras.length >= 20}
        onClick={() => setAdding(true)}
      >
        {t('addLine')}
      </Button>
      <ExtraLineSheet
        open={adding}
        onClose={() => setAdding(false)}
        onAdd={(line) => onChange([...extras, line])}
      />
    </div>
  );
}

function formatSigned(paise: number): string {
  return paise < 0 ? `− ${formatInr(-paise)}` : formatInr(paise);
}
