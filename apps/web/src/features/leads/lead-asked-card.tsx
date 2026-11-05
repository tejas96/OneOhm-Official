'use client';

import { useTranslations } from 'next-intl';
import { CustomerActionsCard } from '@/features/documents/requests/customer-actions-card';
import { useDocumentRights } from '@/features/documents/use-document-rights';

/**
 * What was asked of the lead's customer before any project exists. Asking happens from the lead's
 * Send to customer button; it needs the lead's site (its customer), and the asks move onto the
 * project when one is made.
 */
export function LeadAskedCard({
  leadId,
  hasSite,
}: {
  readonly leadId: string;
  readonly hasSite: boolean;
}) {
  const t = useTranslations('leads');
  const canAsk = useDocumentRights().upload;
  // The hint is for the people who could ask; everyone else sees nothing.
  if (!hasSite) {
    return canAsk ? <p className="type-body-sm text-ink-muted">{t('askNeedsSite')}</p> : null;
  }
  return <CustomerActionsCard scope={{ leadId }} onAsk={canAsk ? () => undefined : null} />;
}
