'use client';

import type { CustomerAlert, CustomerOutbound as Outbound } from '@oneohm/api-contracts';
import { Badge, Card, CardHeader } from '@oneohm/design-system/web';
import { Bell, type LucideIcon, MessageCircle, MessageSquareText } from 'lucide-react';
import { useFormatter, useNow, useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { DeliveryMark } from '@/features/service/whatsapp/message-bubble';

const CHANNEL_ICONS: Readonly<Record<Outbound['channel'], LucideIcon>> = {
  whatsapp: MessageCircle,
  sms: MessageSquareText,
  push: Bell,
};

/** "5 minutes ago", never "in 5 seconds" when the page clock lags the server's. */
function useAgo() {
  const format = useFormatter();
  const now = useNow({ updateInterval: 60_000 });
  return (at: string) => {
    const date = new Date(at);
    return format.relativeTime(date, new Date(Math.max(now.getTime(), date.getTime())));
  };
}

function ListCard({
  title,
  description,
  empty,
  children,
}: {
  readonly title: string;
  readonly description: string;
  readonly empty: string | null;
  readonly children: ReactNode;
}) {
  return (
    <Card className="min-w-0 overflow-hidden">
      <CardHeader title={title} description={description} />
      {empty ? (
        <p className="border-t border-hairline px-5 py-4 type-body-sm text-ink-faint">{empty}</p>
      ) : (
        <ul className="flex max-h-[26rem] flex-col divide-y divide-hairline overflow-y-auto border-t border-hairline">
          {children}
        </ul>
      )}
    </Card>
  );
}

/** WhatsApp updates and phone alerts sent to the customer, with how far each got. */
export function CustomerOutbound({ messages }: { readonly messages: readonly Outbound[] }) {
  const t = useTranslations('customers.conversations');
  const ago = useAgo();
  const label = (message: Outbound) => {
    if (message.title) return message.title;
    const key = `templates.${message.template}`;
    return t.has(key) ? t(key) : t('otherTemplate');
  };
  return (
    <ListCard
      title={t('sentTitle')}
      description={t('sentBody')}
      empty={messages.length === 0 ? t('sentNone') : null}
    >
      {messages.map((message) => {
        const Icon = CHANNEL_ICONS[message.channel];
        return (
          <li key={message.id} className="flex gap-3 px-5 py-3">
            <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-sunken text-ink-muted">
              <Icon aria-hidden className="size-3.5" />
            </span>
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <p className="truncate type-body-sm text-ink">{label(message)}</p>
              <p
                className="flex flex-wrap items-center gap-x-2 type-label text-ink-faint"
                title={message.lastError ?? undefined}
              >
                <span>{t(`channels.${message.channel}`)}</span>
                <span aria-hidden>·</span>
                <time dateTime={message.createdAt}>{ago(message.createdAt)}</time>
                <span aria-hidden>·</span>
                <DeliveryMark state={message.state} />
              </p>
            </div>
          </li>
        );
      })}
    </ListCard>
  );
}

/** The customer app's inbox as they see it, with what they have not opened. */
export function CustomerAlerts({ alerts }: { readonly alerts: readonly CustomerAlert[] }) {
  const t = useTranslations('customers.conversations');
  const ago = useAgo();
  return (
    <ListCard
      title={t('alertsTitle')}
      description={t('alertsBody')}
      empty={alerts.length === 0 ? t('alertsNone') : null}
    >
      {alerts.map((alert) => (
        <li key={alert.id} className="flex flex-col gap-1 px-5 py-3">
          <div className="flex items-start justify-between gap-3">
            <p className="min-w-0 type-body-sm font-medium text-ink">{alert.title}</p>
            {!alert.readAt && <Badge variant="accent">{t('unread')}</Badge>}
          </div>
          <p className="line-clamp-2 type-body-sm text-ink-muted">{alert.body}</p>
          <time dateTime={alert.createdAt} className="type-label text-ink-faint">
            {ago(alert.createdAt)}
          </time>
        </li>
      ))}
    </ListCard>
  );
}
