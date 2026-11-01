'use client';

import type { PurchaseOrderLine } from '@oneohm/api-contracts';
import { Field, Input, Textarea } from '@oneohm/design-system/web';
import { useTranslations } from 'next-intl';
import { formatQuantity } from '../use-inventory';

export interface LineEntry {
  quantity: string;
  serials: string;
  cellManufacturer: string;
  cellInvoiceNumber: string;
  /** Units that failed inspection and go back to the vendor. */
  rejected: string;
  rejectionReason: string;
}

/** One order line on a goods receipt: accepted units, serials, DCR details and rejects. */
export function ReceiveLine({
  line,
  entry,
  error,
  onChange,
}: {
  readonly line: PurchaseOrderLine;
  readonly entry: LineEntry | undefined;
  readonly error: (key: string) => string | undefined;
  readonly onChange: (patch: Partial<LineEntry>) => void;
}) {
  const t = useTranslations('inventory.receive');
  const tr = useTranslations('purchasing.inspection');
  const rejecting = Number(entry?.rejected.replace(/,/g, '') ?? 0) > 0;
  return (
    <fieldset className="flex flex-col gap-4 rounded-2xl border border-hairline p-4">
      <legend className="px-1 type-body font-medium text-ink">{line.description}</legend>
      <p className="-mt-2 type-label text-ink-faint">
        {t('due', {
          remaining: formatQuantity(line.quantity - line.receivedQuantity),
          unit: line.unit,
        })}
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={tr('accepted')} error={error('quantity')}>
          <Input
            inputMode="decimal"
            value={entry?.quantity ?? ''}
            onChange={(e) => onChange({ quantity: e.target.value })}
            trailing={<span className="text-ink-faint">{line.unit}</span>}
          />
        </Field>
        <Field label={tr('rejected')} hint={tr('rejectedHint')} error={error('rejectedQuantity')}>
          <Input
            inputMode="decimal"
            value={entry?.rejected ?? ''}
            placeholder="0"
            onChange={(e) => onChange({ rejected: e.target.value })}
            trailing={<span className="text-ink-faint">{line.unit}</span>}
          />
        </Field>
      </div>
      {rejecting && (
        <Field label={tr('reason')} required error={error('rejectionReason')}>
          <Input
            value={entry?.rejectionReason ?? ''}
            placeholder={tr('reasonPlaceholder')}
            onChange={(e) => onChange({ rejectionReason: e.target.value })}
          />
        </Field>
      )}
      {line.serialised && (
        <Field label={t('serials')} hint={t('serialsHint')} error={error('serials')}>
          <Textarea
            rows={3}
            value={entry?.serials ?? ''}
            onChange={(e) => onChange({ serials: e.target.value })}
            className="font-mono uppercase"
          />
        </Field>
      )}
      {line.category === 'panel' && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('cellManufacturer')} hint={t('cellHint')}>
            <Input
              value={entry?.cellManufacturer ?? ''}
              onChange={(e) => onChange({ cellManufacturer: e.target.value })}
            />
          </Field>
          <Field label={t('cellInvoice')}>
            <Input
              value={entry?.cellInvoiceNumber ?? ''}
              onChange={(e) => onChange({ cellInvoiceNumber: e.target.value })}
            />
          </Field>
        </div>
      )}
    </fieldset>
  );
}
