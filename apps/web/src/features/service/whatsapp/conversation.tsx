'use client';

import { Skeleton, SkeletonGroup } from '@oneohm/design-system/web';
import { useTranslations } from 'next-intl';
import { LoadError } from '@/components/query-state';
import { BackButton, ConversationHeader } from './conversation-header';
import { MessageThread } from './message-thread';
import { ReplyBox } from './reply-box';
import { useChat } from './use-whatsapp';

/** One chat: who it is with, every message, and the reply box. */
export function Conversation({ id, onBack }: { readonly id: string; readonly onBack: () => void }) {
  const t = useTranslations('service.whatsapp');
  const query = useChat(id);

  if (query.isPending) {
    return (
      <>
        <div className="flex items-center gap-3 border-b border-hairline px-4 py-3">
          <BackButton onBack={onBack} />
          <SkeletonGroup label={t('loadingChat')} className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-4 w-40 rounded" />
            <Skeleton className="h-3 w-28 rounded" />
          </SkeletonGroup>
        </div>
        <div className="flex-1 bg-sunken/40" />
      </>
    );
  }
  if (query.isError) {
    return (
      <div className="flex flex-1 flex-col">
        <div className="border-b border-hairline px-4 py-3 lg:hidden">
          <BackButton onBack={onBack} />
        </div>
        <LoadError
          error={query.error}
          onRetry={() => query.refetch()}
          className="m-auto border-0"
        />
      </div>
    );
  }

  const { chat, messages } = query.data;
  return (
    <>
      <ConversationHeader chat={chat} onBack={onBack} />
      <MessageThread name={chat.name} messages={messages} />
      <ReplyBox chat={chat} />
    </>
  );
}
