'use client';

import type { Payable } from '@oneohm/api-contracts';
import { Button } from '@oneohm/design-system/web';
import { Filter, X } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';

const PARTIES = ['vendor', 'contractor'] as const;
type Party = (typeof PARTIES)[number];

/** Today in India as YYYY-MM-DD, plus some days (bills are due on a calendar date). */
function dayFromToday(days: number): string {
  const now = new Date(Date.now() + days * 86_400_000);
  return now.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

/**
 * `?party=vendor|contractor` and `?due=<days>` (from the command centre's money lines)
 * narrow the open bills to what that line counted: one kind of payee, or still owed and
 * due within the days. The chip says what is shown and clears it in one tap.
 */
export function usePayableNarrow() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const askedParty = params.get('party');
  const party: Party | null = PARTIES.find((value) => value === askedParty) ?? null;
  const dueDays = Number(params.get('due'));
  const due = Number.isInteger(dueDays) && dueDays > 0 && dueDays <= 365 ? dueDays : null;
  const dueBy = due === null ? null : dayFromToday(due);
  const keep = (bill: Payable) =>
    (party === null || bill.party === party) &&
    (dueBy === null ||
      (bill.status !== 'paid' && bill.party !== 'employee' && bill.dueOn <= dueBy));
  const clear = () => {
    const next = new URLSearchParams(params);
    next.delete('party');
    next.delete('due');
    router.replace(`${pathname}${next.size ? `?${next.toString()}` : ''}`, { scroll: false });
  };
  return { party, due, active: party !== null || due !== null, keep, clear };
}

export function PayableNarrowChip({
  narrow,
}: {
  readonly narrow: ReturnType<typeof usePayableNarrow>;
}) {
  const t = useTranslations('finance.payables.narrow');
  if (!narrow.active) return null;
  const parts = [
    narrow.party ? t(`party.${narrow.party}`) : null,
    narrow.due ? t('due', { days: narrow.due }) : null,
  ].filter(Boolean);
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-rule bg-accent-soft px-3 py-2 type-body-sm text-ink">
      <Filter aria-hidden className="size-4 text-ink-muted" />
      <span>{t('showing', { what: parts.join(' · ') })}</span>
      <Button size="sm" variant="quiet" leadingIcon={<X />} onClick={narrow.clear}>
        {t('clear')}
      </Button>
    </div>
  );
}
