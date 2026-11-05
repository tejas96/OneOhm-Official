'use client';

import type { DocumentRecord } from '@oneohm/api-contracts';
import { CUSTOMER_DOCUMENT_CATEGORIES } from '@oneohm/domain';
import { LoaderCircle, Send } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCan } from '@/providers/current-user';
import { useSendAction } from './use-send-to-customer';

const ACTION =
  'flex size-8 items-center justify-center rounded-md text-ink-muted transition-colors hover:bg-sunken hover:text-accent';

/**
 * The row action "Send to customer" on a document: the file goes to the customer's WhatsApp with
 * a one-line caption. The server refuses a file the customer cannot see; nothing is sent then.
 */
export function SendDocumentButton({ document }: { readonly document: DocumentRecord }) {
  const t = useTranslations('sendToCustomer');
  const allowed = useCan('documents.upload', 'documents.manage');
  const scope = document.projectId
    ? { projectId: document.projectId }
    : document.customerId
      ? { customerId: document.customerId }
      : null;
  const send = useSendAction(scope ?? {});
  // Only papers the customer can see travel (the server checks again).
  const shared =
    document.source !== 'report' &&
    (CUSTOMER_DOCUMENT_CATEGORIES as readonly string[]).includes(document.category);
  if (!allowed || !scope || !shared) return null;
  return (
    <button
      type="button"
      className={ACTION}
      disabled={send.isPending}
      onClick={() => send.mutate({ action: 'send_document', paperId: `document:${document.id}` })}
    >
      {send.isPending ? (
        <LoaderCircle aria-hidden className="size-4 animate-spin" />
      ) : (
        <Send aria-hidden className="size-4" />
      )}
      <span className="sr-only">{t('sendDocument', { name: document.name })}</span>
    </button>
  );
}
