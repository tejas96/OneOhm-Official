'use client';

import type { SendScope } from '@oneohm/api-contracts';
import { Button } from '@oneohm/design-system/web';
import { Send } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { AskCustomerSheet, type AskDraft } from '@/features/documents/requests/ask-customer-sheet';
import { useCan } from '@/providers/current-user';
import type { QuickPaper } from './quick-papers';
import { SendToCustomerSheet } from './send-to-customer-sheet';

/**
 * The one "Send to customer" button, the same on the customer, project, lead, chat and task
 * screens. It opens the sheet of what fits the place; asking for papers uses the ask sheet.
 */
export function SendToCustomerButton({
  scope,
  variant = 'secondary',
  quickPapers,
}: {
  /** Where it is pressed: a customer, project, lead or task (a task also names its project). */
  readonly scope: SendScope;
  readonly variant?: 'primary' | 'secondary' | 'quiet';
  /** Papers to ask for in one tap at this place (the lender's list, the subsidy passbook). */
  readonly quickPapers?: readonly QuickPaper[];
}) {
  const t = useTranslations('sendToCustomer');
  const allowed = useCan(
    'documents.upload',
    'documents.manage',
    'customers.manage',
    'leads.manage',
    'projects.manage',
    'finance.record_payments',
  );
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<AskDraft | null>(null);
  if (!allowed) return null;
  const askScope = scope.projectId
    ? { projectId: scope.projectId }
    : scope.leadId
      ? { leadId: scope.leadId }
      : null;
  return (
    <>
      <Button size="sm" variant={variant} leadingIcon={<Send />} onClick={() => setOpen(true)}>
        {t('button')}
      </Button>
      <SendToCustomerSheet
        scope={scope}
        taskId={scope.taskId ?? null}
        open={open}
        onClose={() => setOpen(false)}
        onAskPaper={askScope ? () => setDraft({ category: 'other', title: '' }) : null}
        {...(quickPapers ? { quickPapers } : {})}
      />
      {askScope && (
        <AskCustomerSheet scope={askScope} draft={draft} onClose={() => setDraft(null)} />
      )}
    </>
  );
}
