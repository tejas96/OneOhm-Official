'use client';

import { CHAT_LIST_LIMIT, type ChatSummary } from '@oneohm/api-contracts';
import { Card, cn, EmptyState, SegmentedControl } from '@oneohm/design-system/web';
import { MessagesSquare } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useRef } from 'react';
import { ListSkeleton, LoadError } from '@/components/query-state';
import { useChoiceParam } from '@/lib/use-choice-param';
import { matchesSearch, useSearchParam } from '@/lib/use-search-param';
import { useCan } from '@/providers/current-user';
import { ServiceSearch } from '../service-search';
import { ChatList } from './chat-list';
import { Conversation } from './conversation';
import { useChats } from './use-whatsapp';

type Filter = 'reply' | 'late' | 'unassigned' | 'all';
const FILTERS: readonly Filter[] = ['reply', 'late', 'unassigned', 'all'];
// No `?filter=` yet: open on what needs an answer, or every chat when nothing waits.
const CHOICES: readonly (Filter | 'auto')[] = [...FILTERS, 'auto'];
const PHONE = '(max-width: 1023.98px)';

/** Newest conversation first, by the last message either side sent. */
function byLatest(left: ChatSummary, right: ChatSummary): number {
  const at = (chat: ChatSummary) => chat.lastMessage?.at ?? chat.handedOverAt ?? '';
  return at(right).localeCompare(at(left));
}

/**
 * The staff WhatsApp inbox: chats on the left, the open one on the right (`?chat=`).
 * On phones one pane shows at a time and the conversation has a way back. The filter
 * (`?filter=`) and search (`?q=`) live in the URL; the search runs on the server, so it
 * finds chats older than the newest CHAT_LIST_LIMIT.
 */
export function WhatsAppInbox() {
  const t = useTranslations('service.whatsapp');
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const { draft, setDraft, search } = useSearchParam();
  const chats = useChats(search);
  const seesAll = useCan('service.manage', 'customers.manage');
  const [picked, setPicked] = useChoiceParam<Filter | 'auto'>('filter', CHOICES, 'auto');
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
  if (chats.data.length === 0 && !openId && !search)
    return <EmptyState icon={<MessagesSquare />} title={t('empty.all')} />;

  // Searched again here, so an older API that ignores `q` still shows only matches.
  const sorted = chats.data
    .filter((chat) => matchesSearch(search, [chat.name, chat.phone]))
    .sort(byLatest);
  const waiting = sorted.filter((chat) => chat.needsReply);
  const lists: Record<Filter, readonly ChatSummary[]> = {
    reply: waiting,
    late: sorted.filter((chat) => chat.late),
    unassigned: sorted.filter((chat) => !chat.assignee),
    all: sorted,
  };
  // Opens on what needs an answer; with nothing waiting, on every chat.
  // Late and unowned are the desk's filters; anyone else asking for them gets the default.
  const fallsBack =
    picked === 'auto' || (!seesAll && (picked === 'late' || picked === 'unassigned'));
  const filter: Filter = !fallsBack ? picked : waiting.length > 0 ? 'reply' : 'all';
  const shown = lists[filter];
  // Everyone sees what waits and all their chats; the desk also sees late and unowned.
  const options = (seesAll ? FILTERS : (['reply', 'all'] as const)).map((value) => ({
    value,
    label: t(`filter.${value}`, { count: lists[value].length }),
  }));

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
        <div className="flex flex-col gap-2 border-b border-hairline px-3 py-3">
          <ServiceSearch
            value={draft}
            onChange={setDraft}
            label={t('searchLabel')}
            placeholder={t('searchPlaceholder')}
            className="flex-none lg:max-w-none"
          />
          <SegmentedControl
            label={t('filterLabel')}
            size="sm"
            value={filter}
            onValueChange={setPicked}
            options={options}
          />
          {chats.data.length >= CHAT_LIST_LIMIT && (
            <p className="type-body-sm text-ink-faint">{t('capped', { count: CHAT_LIST_LIMIT })}</p>
          )}
        </div>
        <ChatList
          chats={shown}
          openId={openId}
          onOpen={open}
          empty={search ? t('emptySearch', { term: search }) : t(`empty.${filter}`)}
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
