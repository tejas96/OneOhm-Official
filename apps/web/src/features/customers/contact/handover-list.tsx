'use client';

import type { Handover } from '@oneohm/api-contracts';
import { Button } from '@oneohm/design-system/web';
import { Check, Printer } from 'lucide-react';
import { useFormatter, useNow, useTranslations } from 'next-intl';
import { formatPhone } from '@/lib/format/contact';
import { useCan } from '@/providers/current-user';
import { useCompleteHandover } from './use-contact';

/** News to tell a customer in person; tick it off once shared. */
export function HandoverList({
  items,
  showCustomer,
}: {
  readonly items: readonly Handover[];
  readonly showCustomer: boolean;
}) {
  const t = useTranslations('customers.handovers');
  const format = useFormatter();
  const now = useNow();
  const canDo = useCan('customers.manage');
  const complete = useCompleteHandover();
  return (
    <ul className="flex flex-col divide-y divide-hairline">
      {items.map((item) => (
        <li key={item.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:gap-4">
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="type-body-sm font-medium text-ink">{item.title}</span>
            <span className="type-body-sm text-ink-muted">{item.body}</span>
            <span className="type-label text-ink-faint">
              {[
                showCustomer ? `${item.customer} · ${formatPhone(item.phone)}` : null,
                item.projectCode,
                format.relativeTime(new Date(item.createdAt), now),
              ]
                .filter(Boolean)
                .join(' · ')}
            </span>
          </span>
          {item.printPath && (
            <Button asChild size="sm" variant="quiet" className="self-start sm:self-center">
              <a href={item.printPath} target="_blank" rel="noopener">
                <Printer aria-hidden className="size-4" />
                {t('print')}
              </a>
            </Button>
          )}
          {canDo && (
            <Button
              size="sm"
              variant="secondary"
              leadingIcon={<Check />}
              className="self-start sm:self-center"
              pending={complete.isPending && complete.variables?.id === item.id}
              onClick={() => complete.mutate(item)}
            >
              {t('markDone')}
            </Button>
          )}
        </li>
      ))}
    </ul>
  );
}
