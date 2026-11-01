'use client';

import type { ChatMessage } from '@oneohm/api-contracts';
import { cn } from '@oneohm/design-system/web';
import { Check, CheckCheck, CircleAlert, CircleSlash, Clock3, type LucideIcon } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import type { ReactNode } from 'react';

type DeliveryState = NonNullable<ChatMessage['delivery']>;

const MARKS: Readonly<Record<DeliveryState, { icon: LucideIcon; className: string }>> = {
  pending: { icon: Clock3, className: '' },
  skipped: { icon: CircleSlash, className: '' },
  sent: { icon: Check, className: '' },
  delivered: { icon: CheckCheck, className: '' },
  read: { icon: CheckCheck, className: 'text-accent' },
  failed: { icon: CircleAlert, className: 'text-overdue' },
};

/** WhatsApp's ticks, with the word beside them so the state never rests on an icon alone. */
export function DeliveryMark({ state }: { readonly state: DeliveryState }) {
  const t = useTranslations('service.whatsapp.delivery');
  const { icon: Icon, className } = MARKS[state];
  return (
    <span className={cn('inline-flex items-center gap-1', className)}>
      <Icon aria-hidden className="size-3.5" />
      {t(state)}
    </span>
  );
}

/** `*bold*` as WhatsApp shows it; links in our own messages open in a new tab. */
const TOKENS = /\*([^*\n]+)\*|(https?:\/\/\S*[^\s.,;:!?)\]])/g;

function RichText({ body, links }: { readonly body: string; readonly links: boolean }) {
  const parts: ReactNode[] = [];
  let from = 0;
  for (const match of body.matchAll(TOKENS)) {
    const start = match.index;
    if (start > from) parts.push(body.slice(from, start));
    if (match[1] !== undefined) {
      parts.push(<strong key={start}>{match[1]}</strong>);
    } else if (links) {
      parts.push(
        <a
          key={start}
          href={match[0]}
          target="_blank"
          rel="noopener noreferrer"
          className="text-accent underline underline-offset-2"
        >
          {match[0]}
        </a>,
      );
    } else {
      parts.push(match[0]);
    }
    from = start + match[0].length;
  }
  if (from < body.length) parts.push(body.slice(from));
  return <>{parts}</>;
}

/** Customer on the left, OneOhm on the right; ours say who sent them and how far they got. */
export function MessageBubble({ message }: { readonly message: ChatMessage }) {
  const t = useTranslations('service.whatsapp');
  const format = useFormatter();
  const outgoing = message.direction === 'out';
  return (
    <li className={cn('flex flex-col gap-1', outgoing ? 'items-end' : 'items-start')}>
      <div
        className={cn(
          'max-w-[min(36rem,88%)] whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 type-body text-ink [overflow-wrap:anywhere]',
          outgoing
            ? 'rounded-br-md bg-accent-soft'
            : 'rounded-bl-md border border-hairline bg-raised',
        )}
      >
        {message.kind === 'choice' && (
          <span className="block type-label text-ink-faint">{t('picked')}</span>
        )}
        <RichText body={message.body} links={outgoing} />
      </div>
      <p className="flex flex-wrap items-center gap-x-2 px-1 type-label text-ink-faint">
        {outgoing && (
          <span className="font-medium text-ink-muted">{message.sentBy ?? t('assistant')}</span>
        )}
        <time dateTime={message.at}>
          {format.dateTime(new Date(message.at), { hour: 'numeric', minute: '2-digit' })}
        </time>
        {outgoing && message.delivery && <DeliveryMark state={message.delivery} />}
      </p>
    </li>
  );
}
