'use client';

import { useQuery } from '@tanstack/react-query';
import { ArrowRight, UserRoundCheck } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { api, expectStatus } from '@/lib/api/api-client';
import { useDebouncedValue } from '@/lib/use-debounced-value';

const MOBILE = /^(\+91)?[6-9]\d{9}$/;

/**
 * While a number is typed: "This number is already customer X" and "An open lead already
 * has this number", each with a link (PRD 3.3: matching and duplicate detection).
 */
export function PhoneMatchNotice({ phone }: { readonly phone: string }) {
  const t = useTranslations('leads.create');
  const typed = useDebouncedValue(phone.replace(/[\s-]/g, ''), 400);
  const valid = MOBILE.test(typed);
  const match = useQuery({
    queryKey: ['leads', 'match', typed],
    queryFn: () => expectStatus(api.leadIntake.matchPhone({ query: { phone: typed } }), 200),
    enabled: valid,
    staleTime: 30_000,
  });
  const found = valid ? match.data : undefined;
  if (!found?.customer && !found?.openLead) return null;
  return (
    <div
      role="status"
      className="flex flex-col gap-1.5 rounded-lg bg-accent-soft/60 px-3.5 py-3 type-body-sm text-ink sm:col-span-2"
    >
      {found.customer && (
        <p className="flex items-start gap-2">
          <UserRoundCheck aria-hidden className="mt-0.5 size-4 shrink-0 text-accent" />
          <span>
            {t('matchCustomer', { name: found.customer.name })}{' '}
            <MatchLink href={`/customers/${found.customer.id}`} label={t('openCustomer')} />
          </span>
        </p>
      )}
      {found.openLead && (
        <p className="flex items-start gap-2">
          <UserRoundCheck aria-hidden className="mt-0.5 size-4 shrink-0 text-accent" />
          <span>
            {t('matchLead', { name: found.openLead.name })}{' '}
            <MatchLink href={`/leads/${found.openLead.id}`} label={t('openExisting')} />
          </span>
        </p>
      )}
    </div>
  );
}

function MatchLink({ href, label }: { readonly href: string; readonly label: string }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1 font-medium underline underline-offset-4 hover:text-accent"
    >
      {label}
      <ArrowRight aria-hidden className="size-3.5" />
    </Link>
  );
}
