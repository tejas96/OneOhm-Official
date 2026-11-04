'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { AskCustomerSheet, type AskDraft } from '@/features/documents/requests/ask-customer-sheet';
import { CustomerActionsCard } from '@/features/documents/requests/customer-actions-card';
import { useDocumentRights } from '@/features/documents/use-document-rights';

/**
 * Papers asked of the lead's customer before any project exists, with the same sheet the
 * project uses. Asking needs the lead's site (its customer); the asks move onto the project
 * when one is made.
 */
export function LeadAskedCard({
  leadId,
  hasSite,
}: {
  readonly leadId: string;
  readonly hasSite: boolean;
}) {
  const t = useTranslations('leads');
  const canAsk = useDocumentRights().upload && hasSite;
  const [draft, setDraft] = useState<AskDraft | null>(null);
  if (!hasSite)
    return (
      <p className="type-body-sm text-ink-muted">{t('askNeedsSite')}</p>
    );
  return (
    <>
      <CustomerActionsCard
        scope={{ leadId }}
        onAsk={canAsk ? () => setDraft({ category: 'electricity_bill', title: '' }) : null}
      />
      <AskCustomerSheet scope={{ leadId }} draft={draft} onClose={() => setDraft(null)} />
    </>
  );
}
