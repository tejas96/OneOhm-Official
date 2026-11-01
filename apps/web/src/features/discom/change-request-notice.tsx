'use client';

import type { ChangeRequestNotices } from '@oneohm/api-contracts';
import { Button, cn } from '@oneohm/design-system/web';
import { useQuery } from '@tanstack/react-query';
import { FileCog, Lightbulb, Scale } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { api, expectStatus } from '@/lib/api/api-client';
import { useCan } from '@/providers/current-user';
import { RaiseChangeRequestDialog } from './raise-change-request-dialog';
import { CHANGE_REQUESTS_KEY } from './use-discom';

type NoticeScope =
  | { readonly propertyId: string }
  | { readonly projectId: string }
  | { readonly quotationId: string };

/**
 * A calm line where people already look (PRD 3.15, step 2): when the site's details do
 * not match (meter holder, sanctioned load, no connection), the change request to raise,
 * one tap away. On a quotation it also says when the site's type changed since pricing.
 * Shows nothing when all is in order.
 */
export function ChangeRequestNotice({
  scope,
  className,
}: {
  readonly scope: NoticeScope;
  readonly className?: string;
}) {
  const t = useTranslations('discom.notice');
  const canView = useCan('discom.manage', 'customers.view', 'projects.view_all');
  const canRaise = useCan('discom.manage', 'customers.manage');
  const [raising, setRaising] = useState<string | null>(null);
  const query = useQuery({
    queryKey: [...CHANGE_REQUESTS_KEY, 'notices', scope],
    queryFn: () => expectStatus(api.discom.changeRequestNotices({ query: scope }), 200),
    enabled: canView,
    staleTime: 60_000,
  });
  const notices = query.data;
  if (!notices || (notices.suggestions.length === 0 && !notices.repricing)) return null;
  return (
    <section
      aria-label={t('label')}
      className={cn(
        'flex flex-col divide-y divide-hairline rounded-xl border border-hairline bg-raised',
        className,
      )}
    >
      {notices.repricing && <Repricing repricing={notices.repricing} />}
      {notices.suggestions.map((suggestion) => (
        <Suggestion
          key={suggestion.type}
          suggestion={suggestion}
          onRaise={canRaise ? () => setRaising(suggestion.type) : null}
        />
      ))}
      {canRaise && (
        <RaiseChangeRequestDialog
          key={raising ?? 'none'}
          open={raising !== null}
          onOpenChange={(open) => !open && setRaising(null)}
          propertyId={notices.propertyId}
          {...(notices.projectId ? { projectId: notices.projectId } : {})}
          {...(raising ? { initialType: raising } : {})}
        />
      )}
    </section>
  );
}

function Suggestion({
  suggestion,
  onRaise,
}: {
  readonly suggestion: ChangeRequestNotices['suggestions'][number];
  readonly onRaise: (() => void) | null;
}) {
  const t = useTranslations('discom.notice');
  return (
    <div className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="flex min-w-0 items-start gap-2.5 type-body-sm text-ink">
        <Lightbulb aria-hidden className="mt-0.5 size-4 shrink-0 text-at-risk" />
        <span className="min-w-0">
          <span className="font-medium">{t('suggestion', { type: suggestion.title })}</span>{' '}
          <span className="text-ink-muted">{suggestion.reason}</span>
        </span>
      </p>
      {onRaise && (
        <Button
          size="sm"
          variant="secondary"
          leadingIcon={<FileCog />}
          onClick={onRaise}
          className="shrink-0 self-start sm:self-auto"
        >
          {t('raise')}
        </Button>
      )}
    </div>
  );
}

function Repricing({
  repricing,
}: {
  readonly repricing: NonNullable<ChangeRequestNotices['repricing']>;
}) {
  const t = useTranslations('discom.notice');
  const categoryT = useTranslations('leads.category');
  return (
    <p className="flex items-start gap-2.5 px-4 py-3 type-body-sm text-ink">
      <Scale aria-hidden className="mt-0.5 size-4 shrink-0 text-at-risk" />
      <span className="min-w-0">
        <span className="font-medium">{t('repricingTitle')}.</span>{' '}
        <span className="text-ink-muted">
          {t('repricing', {
            pricedAs: categoryT(repricing.pricedAs).toLowerCase(),
            siteIs: categoryT(repricing.siteIs).toLowerCase(),
          })}
        </span>
      </span>
    </p>
  );
}
