'use client';

import type { DocumentRequest } from '@oneohm/api-contracts';
import { Button, Card, CardHeader } from '@oneohm/design-system/web';
import { Send } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { ListSkeleton, LoadError } from '@/components/query-state';
import { ActionRow } from './action-row';
import { ReaskSheet, type ReaskTarget } from './reask-sheet';
import { type ActionScope, useDocumentRequests } from './use-document-requests';

/** Done and cancelled asks show only the latest few; the log keeps the rest. */
const RECENT = 5;

/** Open and waiting asks first, then the latest finished ones. */
export function shown(requests: readonly DocumentRequest[]): DocumentRequest[] {
  const live = requests.filter((one) => one.status === 'open' || one.status === 'received');
  const past = requests.filter((one) => one.status === 'closed' || one.status === 'cancelled');
  return [...live, ...past.slice(0, RECENT)];
}

/**
 * "Asked from the customer": what the team asked the customer to do, on a project, a lead
 * or the customer's own page, and where each stands (redesign §18). A paper they sent
 * waits for the check: [Looks good] or [Ask again].
 */
export function CustomerActionsCard({
  scope,
  onAsk,
}: {
  readonly scope: ActionScope;
  /** Opens the ask sheet; null where the team cannot ask from here. */
  readonly onAsk: (() => void) | null;
}) {
  const t = useTranslations('documents.requests');
  const query = useDocumentRequests(scope);
  const [reasking, setReasking] = useState<ReaskTarget | null>(null);
  const requests = shown(query.data ?? []);
  if (!onAsk && requests.length === 0 && !query.isPending) return null;
  return (
    <Card>
      <CardHeader
        title={t('title')}
        description={t('intro')}
        action={
          onAsk && (
            <Button size="sm" variant="secondary" leadingIcon={<Send />} onClick={onAsk}>
              {t('ask')}
            </Button>
          )
        }
      />
      <div className="px-5 pb-4">
        {query.isPending && <ListSkeleton label={t('loading')} rows={2} />}
        {query.isError && <LoadError error={query.error} onRetry={() => query.refetch()} />}
        {requests.length > 0 && (
          <ul className="flex flex-col divide-y divide-hairline">
            {requests.map((request) => (
              <ActionRow
                key={request.id}
                request={request}
                onReask={() => setReasking({
                    id: request.id,
                    title: request.title,
                    byTeam: request.documentByTeam === true,
                  })}
              />
            ))}
          </ul>
        )}
      </div>
      <ReaskSheet target={reasking} onClose={() => setReasking(null)} />
    </Card>
  );
}
