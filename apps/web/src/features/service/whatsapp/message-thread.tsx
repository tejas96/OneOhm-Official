'use client';

import type { ChatMessage } from '@oneohm/api-contracts';
import { useFormatter, useNow, useTranslations } from 'next-intl';
import { type UIEvent, useEffect, useRef } from 'react';
import { MessageBubble } from './message-bubble';

/** Within this distance of the end, new messages scroll into view; further up, reading wins. */
const STICK_PX = 160;
const DAY_MS = 24 * 3600 * 1000;

interface DayGroup {
  readonly key: string;
  readonly at: string;
  readonly messages: ChatMessage[];
}

function groupByDay(messages: readonly ChatMessage[], dayOf: (at: Date) => string): DayGroup[] {
  const groups: DayGroup[] = [];
  for (const message of messages) {
    const key = dayOf(new Date(message.at));
    const current = groups[groups.length - 1];
    if (current?.key === key) current.messages.push(message);
    else groups.push({ key, at: message.at, messages: [message] });
  }
  return groups;
}

/** Every message in the chat, oldest first, under a line for each day. */
export function MessageThread({
  name,
  messages,
}: {
  readonly name: string;
  readonly messages: readonly ChatMessage[];
}) {
  const t = useTranslations('service.whatsapp');
  const format = useFormatter();
  const now = useNow({ updateInterval: 60_000 });
  const scroller = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const count = messages.length;

  useEffect(() => {
    const element = scroller.current;
    if (!element || count === 0 || !stick.current) return;
    element.scrollTop = element.scrollHeight;
  }, [count]);

  const onScroll = (event: UIEvent<HTMLDivElement>) => {
    const element = event.currentTarget;
    stick.current = element.scrollHeight - element.scrollTop - element.clientHeight < STICK_PX;
  };

  const dayOf = (at: Date) =>
    format.dateTime(at, { year: 'numeric', month: '2-digit', day: '2-digit' });
  const today = dayOf(now);
  const yesterday = dayOf(new Date(now.getTime() - DAY_MS));
  const dayLabel = (group: DayGroup) => {
    if (group.key === today) return t('today');
    if (group.key === yesterday) return t('yesterday');
    return format.dateTime(new Date(group.at), { weekday: 'short', day: 'numeric', month: 'long' });
  };

  return (
    <div
      ref={scroller}
      onScroll={onScroll}
      className="flex-1 overflow-y-auto overscroll-contain bg-sunken/40 px-3 py-4 sm:px-5"
    >
      {count === 0 ? (
        <p className="py-10 text-center type-body-sm text-ink-muted">{t('emptyChat')}</p>
      ) : (
        <div role="log" aria-label={t('messagesLabel', { name })} className="flex flex-col gap-5">
          {groupByDay(messages, dayOf).map((group) => (
            <section key={group.key} aria-label={dayLabel(group)} className="flex flex-col gap-3">
              <p className="flex items-center gap-3 type-label text-ink-faint" aria-hidden>
                <span className="h-px flex-1 bg-hairline" />
                {dayLabel(group)}
                <span className="h-px flex-1 bg-hairline" />
              </p>
              <ol className="flex flex-col gap-3">
                {group.messages.map((message) => (
                  <MessageBubble key={message.id} message={message} />
                ))}
              </ol>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
