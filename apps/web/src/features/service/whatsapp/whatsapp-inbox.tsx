'use client';

import type { ChatSummary } from '@oneohm/api-contracts';
import { Card, cn, EmptyState, SegmentedControl } from '@oneohm/design-system/web';
import { MessagesSquare } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useRef, useState } from 'react';
import { ListSkeleton, LoadError } from '@/components/query-state';
import { ChatList } from './chat-list';
import { Conversation } from './conversation';
import { useChats } from './use-whatsapp';

type Filter = 'all' | 'human';
const PHONE = '(max-width: 1023.98px)';

/** Newest conversation first, by the last message either side sent. */
function byLatest(left: ChatSummary, right: ChatSummary): number {
  const at = (chat: ChatSummary) => chat.lastMessage?.at ?? chat.handedOverAt ?? '';
  return at(right).localeCompare(at(left));
}

/**
 * The staff WhatsApp inbox: chats on the left, the open one on the right (`?chat=`).
 * On phones one pane shows at a time and the conversation has a way back.
 */
export function WhatsAppInbox() {
  const t = useTranslations('service.whatsapp');
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const chats = useChats();
  const [filter, setFilter] = useState<Filter>('all');
  const openId = params.get('chat');
  const frame = useRef<HTMLElement>(null);

  const open = (id: string | null) => {
    const next = new URLSearchParams(params);
    if (id) next.set('chat', id);
    else next.delete('chat');
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
    // On phones the conversation takes the whole frame; bring all of it into view.
    if (id && window.matchMedia(PHONE).matches)
      requestAnimationFrame(() => frame.current?.scrollIntoView({ block: 'start' }));
  };

  if (chats.isPending) return <ListSkeleton label={t('loading')} rows={4} />;
  if (chats.isError) return <LoadError error={chats.error} onRetry={() => chats.refetch()} />;
  if (chats.data.length === 0 && !openId)
    return <EmptyState icon={<MessagesSquare />} title={t('empty.all')} />;

  const sorted = [...chats.data].sort(byLatest);
  const waiting = sorted.filter((chat) => chat.state === 'human');
  const shown = filter === 'human' ? waiting : sorted;

  return (
    <Card
      ref={frame}
      className="flex h-[calc(100dvh-5rem)] min-h-[30rem] scroll-mt-16 overflow-hidden lg:h-[calc(100dvh-19rem)] lg:max-h-[52rem]"
    >
      <section
        aria-label={t('listLabel')}
        className={cn(
          'flex w-full min-w-0 flex-col lg:w-[19rem] lg:shrink-0 lg:border-r lg:border-hairline xl:w-[21rem]',
          openId && 'max-lg:hidden',
        )}
      >
        <div className="border-b border-hairline px-3 py-3">
          <SegmentedControl
            label={t('filterLabel')}
            size="sm"
            value={filter}
            onValueChange={setFilter}
            options={[
              { value: 'all', label: t('filter.all') },
              { value: 'human', label: t('filter.human', { count: waiting.length }) },
            ]}
          />
        </div>
        <ChatList
          chats={shown}
          openId={openId}
          onOpen={open}
          empty={filter === 'human' ? t('empty.human') : t('empty.all')}
        />
      </section>
      <div className={cn('min-w-0 flex-1 flex-col', openId ? 'flex' : 'hidden lg:flex')}>
        {openId ? (
          <Conversation key={openId} id={openId} onBack={() => open(null)} />
        ) : (
          <EmptyState
            icon={<MessagesSquare />}
            title={t('pickTitle')}
            description={t('pickBody')}
            className="m-auto border-0"
          />
        )}
      </div>
    </Card>
  );
}
