'use client';

import type { ChatSummary } from '@oneohm/api-contracts';
import { Avatar, Badge, cn } from '@oneohm/design-system/web';
import { useTranslations } from 'next-intl';
import { useBrandName } from '@/features/shell/company-name';
import { formatPhone, swatchFor } from '@/lib/format/contact';
import { useAgo } from '../use-ago';

/** One line of a WhatsApp message: no line breaks, no *bold* markers. */
export function plainLine(body: string): string {
  return body
    .replace(/\*([^*\n]+)\*/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

export function ChatList({
  chats,
  openId,
  onOpen,
  empty,
}: {
  readonly chats: readonly ChatSummary[];
  readonly openId: string | null;
  readonly onOpen: (id: string) => void;
  readonly empty: string;
}) {
  if (chats.length === 0) {
    return <p className="px-5 py-8 text-center type-body-sm text-ink-muted">{empty}</p>;
  }
  return (
    <ul className="flex-1 divide-y divide-hairline overflow-y-auto overscroll-contain">
      {chats.map((chat) => (
        <li key={chat.id}>
          <ChatRow chat={chat} selected={chat.id === openId} onOpen={onOpen} />
        </li>
      ))}
    </ul>
  );
}

function ChatRow({
  chat,
  selected,
  onOpen,
}: {
  readonly chat: ChatSummary;
  readonly selected: boolean;
  readonly onOpen: (id: string) => void;
}) {
  const t = useTranslations('service.whatsapp');
  const ago = useAgo('short');
  const brand = useBrandName();
  const last = chat.lastMessage;
  const preview = last
    ? last.direction === 'out' && brand
      ? t('fromUs', { company: brand, text: plainLine(last.body) })
      : plainLine(last.body)
    : t('noMessages');
  return (
    <button
      type="button"
      onClick={() => onOpen(chat.id)}
      aria-current={selected ? 'true' : undefined}
      className={cn(
        'flex w-full gap-3 px-4 py-3.5 text-left transition-colors',
        selected ? 'bg-accent-soft/70' : 'hover:bg-sunken/60',
      )}
    >
      <span aria-hidden className="pt-0.5">
        <Avatar name={chat.name} swatch={swatchFor(chat.id)} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex items-baseline justify-between gap-2">
          <span className="truncate type-body font-medium text-ink">{chat.name}</span>
          {last && (
            <time dateTime={last.at} className="shrink-0 type-label text-ink-faint">
              {ago(last.at)}
            </time>
          )}
        </span>
        <span className="truncate type-body-sm text-ink-muted">{preview}</span>
        <span className="mt-1 flex flex-wrap items-center gap-2">
          <span className="type-label text-ink-faint tabular-nums">{formatPhone(chat.phone)}</span>
          {chat.state === 'human' && <Badge variant="accent">{t('withPerson')}</Badge>}
        </span>
      </span>
    </button>
  );
}
