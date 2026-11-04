'use client';

import type { Departure } from '@oneohm/api-contracts';
import { formatInr } from '@oneohm/shared';
import { TriangleAlert } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { openWorkRows, settlementRows } from './departure';

type SoleCapability = Departure['soleHolderOf'][number];

const SOLE_COPY: Partial<
  Record<SoleCapability, 'approvePayments' | 'managePeople' | 'manageRoles'>
> = {
  'finance.approve_payments': 'approvePayments',
  'people.manage': 'managePeople',
  'roles.manage': 'manageRoles',
};

function Heading({ children }: { readonly children: string }) {
  return <h3 className="type-overline text-ink-faint uppercase">{children}</h3>;
}

function Rows({ lines }: { readonly lines: readonly { key: string; text: string }[] }) {
  return (
    <ul className="flex flex-col divide-y divide-hairline rounded-md bg-sunken/70">
      {lines.map((line) => (
        <li key={line.key} className="px-3 py-2.5 type-body-sm text-ink tabular-nums">
          {line.text}
        </li>
      ))}
    </ul>
  );
}

/** "What they have open": one plain line per kind of work, kinds they have none of left out. */
export function OpenWorkList({ counts }: { readonly counts: Departure['counts'] }) {
  const t = useTranslations('team.remove');
  const rows = openWorkRows(counts);
  return (
    <section className="flex flex-col gap-2">
      <Heading>{t('openTitle')}</Heading>
      {rows.length === 0 ? (
        <p className="type-body-sm text-ink-muted">{t('nothingOpen')}</p>
      ) : (
        <Rows
          lines={rows.map((row) => ({
            key: row.key,
            text: t(`open.${row.key}`, { count: row.count }),
          }))}
        />
      )}
    </section>
  );
}

/** One warning per key permission that nobody else will hold once they go. Warns, never blocks. */
export function SoleHolderWarnings({
  capabilities,
}: {
  readonly capabilities: readonly SoleCapability[];
}) {
  const t = useTranslations('team.remove.sole');
  const lines = [...new Set(capabilities.map((capability) => SOLE_COPY[capability] ?? 'other'))];
  if (lines.length === 0) return null;
  return (
    <ul className="flex flex-col gap-2">
      {lines.map((line) => (
        <li
          key={line}
          role="alert"
          className="flex items-start gap-2 rounded-md bg-at-risk-tint px-3 py-2.5 type-body-sm text-ink"
        >
          <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-at-risk" />
          {t(line)}
        </li>
      ))}
    </ul>
  );
}

/**
 * "Still to settle for Asha": money the company still owes them and points still waiting.
 * Nothing is shown when nothing is owed (spec: Points, bonuses and claims).
 */
export function SettlementList({
  name,
  settlement,
}: {
  readonly name: string;
  readonly settlement: Departure['settlement'];
}) {
  const t = useTranslations('team.settlement');
  const rows = settlementRows(settlement);
  if (rows.length === 0) return null;
  return (
    <section className="flex flex-col gap-2">
      <Heading>{t('title', { name })}</Heading>
      <Rows
        lines={rows.map((row) => ({
          key: row.key,
          text: t(row.key, {
            count: row.count,
            amount: row.paise === null ? '' : formatInr(row.paise),
          }),
        }))}
      />
      <p className="type-body-sm text-ink-faint">{t('hint')}</p>
    </section>
  );
}

/** True when the settlement list would show anything. */
export const owesAnything = (settlement: Departure['settlement']) =>
  settlementRows(settlement).length > 0;
