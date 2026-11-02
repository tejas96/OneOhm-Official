'use client';

import type { ProjectDetail } from '@oneohm/api-contracts';
import { Button, Card, StatusPill } from '@oneohm/design-system/web';
import { MessageCircle } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { plainLine } from '@/features/service/whatsapp/chat-list';
import { useChatByPhone } from '@/features/service/whatsapp/use-whatsapp';

/**
 * A quiet nudge on the project: the customer wrote on WhatsApp and waits for an answer.
 * The chat itself lives on the customer page; nothing shows while nobody waits.
 */
export function CustomerChatCard({ project }: { readonly project: ProjectDetail }) {
  const t = useTranslations('service.whatsapp');
  const detail = useChatByPhone(project.customer.phone, project.customer.id).data;
  if (!detail?.chat.needsReply) return null;
  const { chat } = detail;
  return (
    <Card className="flex flex-col gap-3 p-5">
      <div className="flex items-center gap-2">
        <MessageCircle aria-hidden className="size-4 text-accent" />
        <h2 className="flex-1 type-overline text-ink-faint uppercase">{t('customerChat')}</h2>
        <StatusPill
          tone={chat.late ? 'overdue' : 'atRisk'}
          size="sm"
          label={chat.late ? t('late') : t('needsReply')}
        />
      </div>
      {chat.lastMessage && (
        <p className="line-clamp-2 type-body-sm text-ink-muted">
          {plainLine(chat.lastMessage.body)}
        </p>
      )}
      <Button asChild size="sm" variant="secondary" className="self-start">
        <Link href={`/customers/${project.customer.id}?tab=conversations`}>{t('openChat')}</Link>
      </Button>
    </Card>
  );
}
