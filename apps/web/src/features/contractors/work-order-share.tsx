'use client';

import type { WorkOrderDetail } from '@oneohm/api-contracts';
import { Button } from '@oneohm/design-system/web';
import { FileDown, MessageCircle } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';

/**
 * Hands the work order to the crew (PRD 3.13): the PDF to print or forward, and a
 * WhatsApp message listing the tasks. WhatsApp opens on this device, so the office
 * picks the chat and can attach the PDF; nothing is sent automatically.
 */
export function WorkOrderShare({ order }: { readonly order: WorkOrderDetail }) {
  const t = useTranslations('contractors.workOrder.share');
  const format = useFormatter();
  const due = order.dueDate
    ? format.dateTime(new Date(order.dueDate), { day: 'numeric', month: 'long' })
    : null;
  const text = [
    t('message', { number: order.number, project: order.project.code, site: order.project.name }),
    ...order.tasks.map((task) => `• ${task.title}`),
    due ? t('messageDue', { date: due }) : null,
  ]
    .filter(Boolean)
    .join('\n');
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button asChild variant="quiet" leadingIcon={<FileDown />}>
        <a
          href={`/api/v1/work-orders/${order.id}/pdf?disposition=inline`}
          target="_blank"
          rel="noopener"
        >
          {t('pdf')}
        </a>
      </Button>
      <Button asChild variant="quiet" leadingIcon={<MessageCircle />}>
        <a href={`https://wa.me/?text=${encodeURIComponent(text)}`} target="_blank" rel="noopener">
          {t('whatsapp')}
        </a>
      </Button>
    </div>
  );
}
