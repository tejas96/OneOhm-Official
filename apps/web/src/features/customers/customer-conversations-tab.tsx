'use client';

import type { CustomerActivity, CustomerChat } from '@oneohm/api-contracts';
import { Badge, Button, Card, CardHeader, EmptyState } from '@oneohm/design-system/web';
import { ArrowUpRight, MessageCircle } from 'lucide-react';
import Link from 'next/link';
import { useFormatter, useNow, useTranslations } from 'next-intl';
import { MessageThread } from '@/features/service/whatsapp/message-thread';
import { formatPhone } from '@/lib/format/contact';
import { useCan } from '@/providers/current-user';
import { CustomerAlerts, CustomerOutbound } from './customer-outbound';

/** Every conversation with the customer: the WhatsApp chat, messages sent and app alerts. */
export function CustomerConversationsTab({
  activity,
  name,
  phone,
}: {
  readonly activity: CustomerActivity;
  readonly name: string;
  readonly phone: string;
}) {
  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
      <ChatCard chat={activity.chat} name={name} phone={phone} />
      <div className="flex min-w-0 flex-col gap-6">
        <CustomerOutbound messages={activity.outbound} />
        <CustomerAlerts alerts={activity.alerts} />
      </div>
    </div>
  );
}

function ChatCard({
  chat,
  name,
  phone,
}: {
  readonly chat: CustomerChat | null;
  readonly name: string;
  readonly phone: string;
}) {
  const t = useTranslations('customers.conversations');
  const format = useFormatter();
  const now = useNow({ updateInterval: 60_000 });
  const canOpenInbox = useCan('service.manage', 'customers.manage');

  if (!chat) {
    return (
      <Card className="min-w-0">
        <CardHeader title={t('chatTitle')} />
        <EmptyState
          icon={<MessageCircle />}
          title={t('noChat')}
          description={t('noChatBody', { phone: formatPhone(phone) })}
          className="mx-4 mb-4 border-hairline"
        />
      </Card>
    );
  }
  const lastInbound = chat.lastInboundAt ? new Date(chat.lastInboundAt) : null;
  return (
    <Card className="flex min-w-0 flex-col overflow-hidden">
      <CardHeader
        title={
          <span className="flex flex-wrap items-center gap-2">
            {t('chatTitle')}
            {chat.state === 'human' && <Badge variant="accent">{t('withTeam')}</Badge>}
          </span>
        }
        description={
          lastInbound
            ? t('chatBody', {
                count: chat.messageCount,
                when: format.relativeTime(
                  lastInbound,
                  new Date(Math.max(now.getTime(), lastInbound.getTime())),
                ),
              })
            : t('chatBodyNoInbound', { count: chat.messageCount })
        }
        action={
          canOpenInbox && (
            <Button asChild variant="secondary" size="sm" trailingIcon={<ArrowUpRight />}>
              <Link href={`/service?tab=whatsapp&chat=${chat.id}`}>{t('openInbox')}</Link>
            </Button>
          )
        }
      />
      <div className="flex h-[30rem] flex-col border-t border-hairline md:h-[36rem]">
        <MessageThread name={name} messages={chat.messages} />
      </div>
      {chat.messageCount > chat.messages.length && (
        <p className="border-t border-hairline px-5 py-3 type-body-sm text-ink-faint">
          {t('showingLatest', { shown: chat.messages.length, count: chat.messageCount })}
        </p>
      )}
    </Card>
  );
}
