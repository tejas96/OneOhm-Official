'use client';

import type { MaterialSlip } from '@oneohm/api-contracts';
import { Card, CardHeader, type PillTone, StatusPill } from '@oneohm/design-system/web';
import { ImageIcon } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { documentUrl } from '@/lib/api/upload';
import { formatQuantity } from '../use-inventory';

const TONE: Readonly<Record<MaterialSlip['kind'], PillTone>> = {
  issue: 'waiting',
  use: 'done',
  return: 'onTrack',
};

/** Issue, usage and return slips, newest first: what, how much, when and who. */
export function SlipsCard({
  slips,
  showProject = false,
}: {
  readonly slips: readonly MaterialSlip[];
  readonly showProject?: boolean;
}) {
  const t = useTranslations('inventory.custody');
  return (
    <Card className="flex flex-col overflow-hidden">
      <CardHeader title={t('historyTitle')} />
      {slips.length === 0 ? (
        <p className="border-t border-hairline px-5 py-4 type-body-sm text-ink-muted">
          {t('historyEmpty')}
        </p>
      ) : (
        <ol className="flex flex-col divide-y divide-hairline border-t border-hairline">
          {slips.map((slip) => (
            <SlipRow key={slip.id} slip={slip} showProject={showProject} />
          ))}
        </ol>
      )}
    </Card>
  );
}

function SlipRow({
  slip,
  showProject,
}: {
  readonly slip: MaterialSlip;
  readonly showProject: boolean;
}) {
  const t = useTranslations('inventory.custody');
  const format = useFormatter();
  const where = slip.dispatchNumber
    ? t('slipChallan', { number: slip.dispatchNumber })
    : slip.taskTitle
      ? t('slipTask', { task: slip.taskTitle })
      : slip.locationName
        ? t('slipFrom', { place: slip.locationName })
        : null;
  return (
    <li className="flex flex-col gap-1.5 px-5 py-3.5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <StatusPill tone={TONE[slip.kind]} label={t(`kinds.${slip.kind}`)} size="sm" />
        <span className="font-mono text-[0.75rem] text-ink">{slip.number}</span>
        <span className="type-label text-ink-muted">
          {showProject ? `${slip.project.code} · ` : `${slip.contractor.name} · `}
          {t('slipMeta', {
            date: format.dateTime(new Date(slip.occurredOn), { dateStyle: 'medium' }),
            who: slip.recordedBy ?? '—',
          })}
          {where && ` · ${where}`}
        </span>
        {slip.photoDocumentId && (
          <a
            href={documentUrl(slip.photoDocumentId)}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 type-label text-accent hover:underline"
          >
            <ImageIcon aria-hidden className="size-3.5" />
            {t('photo')}
          </a>
        )}
      </div>
      <p className="type-body-sm text-ink">
        {slip.lines
          .map((line) => `${formatQuantity(line.quantity)} ${line.unit} ${line.name}`)
          .join(' · ')}
      </p>
      {slip.note && <p className="type-label text-ink-faint">{slip.note}</p>}
    </li>
  );
}
