'use client';

import type { Person } from '@oneohm/api-contracts';
import { StatusPill } from '@oneohm/design-system/web';
import { useTranslations } from 'next-intl';

type LoadState = Person['loadState'];

/** "At limit" or "Over limit" against the person's open-task limit; nothing when there is room. */
export function OverloadBadge({ person }: { readonly person: { readonly loadState: LoadState } }) {
  const t = useTranslations('team.capacity');
  if (person.loadState === 'ok') return null;
  return (
    <StatusPill
      size="sm"
      tone={person.loadState === 'over' ? 'overdue' : 'atRisk'}
      label={t(person.loadState === 'over' ? 'over' : 'full')}
    />
  );
}

/** "8 open" or "12 / 10 open", with the badge when at or over the limit. */
export function LoadCell({
  open,
  limit,
  state,
}: {
  readonly open: number;
  readonly limit: number | null;
  readonly state: LoadState;
}) {
  const t = useTranslations('team.capacity');
  return (
    <span className="inline-flex flex-wrap items-center justify-end gap-2 md:justify-start">
      <span className={open > 0 ? 'text-ink tabular-nums' : 'text-ink-faint tabular-nums'}>
        {limit === null ? t('open', { count: open }) : t('openOfLimit', { count: open, limit })}
      </span>
      <OverloadBadge person={{ loadState: state }} />
    </span>
  );
}
