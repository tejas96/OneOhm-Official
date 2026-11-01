'use client';

import type { SlaStateValue } from '@oneohm/api-contracts';
import { type PillTone, StatusPill } from '@oneohm/design-system/web';
import { useFormatter, useNow, useTranslations } from 'next-intl';

const TONE: Readonly<Record<SlaStateValue, PillTone>> = {
  on_track: 'onTrack',
  due_soon: 'atRisk',
  breached: 'overdue',
  met: 'done',
  missed: 'blocked',
};

/**
 * Where one promised time stands, with when it is due (or was done). Requests raised
 * before service levels existed show "No promise".
 */
export function SlaCell({
  state,
  dueAt,
  doneAt,
}: {
  readonly state: SlaStateValue | null;
  readonly dueAt: string | null;
  readonly doneAt: string | null;
}) {
  const t = useTranslations('service.sla');
  const format = useFormatter();
  const now = useNow({ updateInterval: 60_000 });
  if (!state || !dueAt) return <span className="type-body-sm text-ink-faint">{t('none')}</span>;
  const closed = state === 'met' || state === 'missed';
  const at = closed && doneAt ? doneAt : dueAt;
  const time = format.relativeTime(new Date(at), now);
  return (
    <span className="flex flex-col items-start gap-1">
      <StatusPill size="sm" tone={TONE[state]} label={t(`state.${state}`)} />
      <span className="whitespace-nowrap type-label text-ink-faint">
        {closed ? t('done', { time }) : t('due', { time })}
      </span>
    </span>
  );
}
