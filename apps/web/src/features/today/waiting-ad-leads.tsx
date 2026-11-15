'use client';

import { Card } from '@oneohm/design-system/web';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useAgo } from '@/features/service/use-ago';
import { api, expectStatus } from '@/lib/api/api-client';
import { useCan } from '@/providers/current-user';

/**
 * New leads from ads that nobody has called yet. Only for people who work leads; it stays
 * out of the way when there are none, or when the list cannot be loaded.
 */
export function WaitingAdLeads() {
  const t = useTranslations('today.adLeads');
  const ago = useAgo();
  const allowed = useCan('leads.manage', 'leads.view_all');
  const query = useQuery({
    queryKey: ['marketing', 'waiting-leads'],
    queryFn: () => expectStatus(api.marketing.waitingLeads(), 200),
    enabled: allowed,
    refetchInterval: 60_000,
  });
  if (!allowed || !query.data || query.data.count <= 0) return null;
  const { count, leads } = query.data;
  return (
    <Card className="flex flex-col gap-2 rounded-[28px] p-5">
      <p className="flex items-center gap-2.5 type-title-md text-ink">
        <span aria-hidden className="relative flex size-2.5">
          <span className="absolute inline-flex size-full rounded-full bg-accent opacity-60 motion-safe:animate-ping" />
          <span className="relative inline-flex size-2.5 rounded-full bg-accent" />
        </span>
        {t('title', { count })}
      </p>
      <ul className="flex flex-col divide-y divide-hairline">
        {leads.slice(0, 3).map((lead) => (
          <li key={lead.id}>
            <Link
              href={`/leads/${lead.id}`}
              className="flex min-h-11 flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 py-2 hover:text-accent"
            >
              <span className="min-w-0 truncate type-body font-medium text-ink">
                {lead.name}
                <span className="font-normal text-ink-muted"> · {lead.city}</span>
              </span>
              <span className="type-body-sm text-ink-faint">
                {lead.campaign} · {ago(lead.createdAt)}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}
