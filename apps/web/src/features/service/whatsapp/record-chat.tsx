'use client';

import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  StatusPill,
  useToast,
} from '@oneohm/design-system/web';
import { useQueryClient } from '@tanstack/react-query';
import { MessageCircle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { ListSkeleton, LoadError } from '@/components/query-state';
import { describeError } from '@/lib/api/api-error';
import { formatPhone } from '@/lib/format/contact';
import { MessageThread } from './message-thread';
import { PassChat } from './pass-chat';
import { ReplyBox } from './reply-box';
import { useChatByPhone, useOpenChat } from './use-whatsapp';

/**
 * The WhatsApp chat on a customer or lead page: read it and answer it right here, from
 * the business number. With no chat yet, one tap starts it.
 */
export function RecordChat({
  phone,
  name,
  customerId,
}: {
  readonly phone: string;
  readonly name: string;
  /** On a customer page: also finds a chat started from a family member's number. */
  readonly customerId?: string;
}) {
  const t = useTranslations('service.whatsapp');
  const toast = useToast();
  const queryClient = useQueryClient();
  const query = useChatByPhone(phone, customerId);
  const start = useOpenChat();

  if (query.isPending) return <ListSkeleton label={t('loadingChat')} rows={3} />;
  if (query.isError) return <LoadError error={query.error} onRetry={() => query.refetch()} />;
  if (!query.data)
    return (
      <Card className="min-w-0">
        <CardHeader title={t('customerChat')} />
        <EmptyState
          icon={<MessageCircle />}
          title={t('noChatYet')}
          description={formatPhone(phone)}
          action={
            <Button
              size="sm"
              leadingIcon={<MessageCircle />}
              pending={start.isPending}
              onClick={() =>
                start.mutate(phone, {
                  onSuccess: () =>
                    queryClient.invalidateQueries({ queryKey: ['whatsapp', 'by-phone'] }),
                  onError: (error) =>
                    toast({
                      tone: 'error',
                      title: t('openFailed'),
                      description: describeError(error),
                    }),
                })
              }
            >
              {t('startChat')}
            </Button>
          }
          className="mx-4 mb-4 border-hairline"
        />
      </Card>
    );

  const { chat, messages } = query.data;
  return (
    <Card className="flex min-w-0 flex-col overflow-hidden">
      <CardHeader
        title={
          <span className="flex flex-wrap items-center gap-2">
            {t('customerChat')}
            {chat.late ? (
              <StatusPill tone="overdue" size="sm" label={t('late')} />
            ) : (
              chat.needsReply && <Badge variant="accent">{t('needsReply')}</Badge>
            )}
          </span>
        }
        description={
          chat.assignee
            ? t('answeredBy', { name: chat.assignee.name })
            : chat.customerId
              ? t('teamAnswers')
              : t('salesAnswers')
        }
        action={<PassChat chat={chat} />}
      />
      <div className="flex h-[26rem] flex-col border-t border-hairline md:h-[32rem]">
        <MessageThread name={name} messages={messages} />
      </div>
      <ReplyBox chat={chat} />
    </Card>
  );
}
