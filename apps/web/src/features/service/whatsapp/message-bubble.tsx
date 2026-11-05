'use client';

import type { ChatFile, ChatMessage } from '@oneohm/api-contracts';
import { cn } from '@oneohm/design-system/web';
import {
  Check,
  CheckCheck,
  CircleAlert,
  CircleSlash,
  Clock3,
  FileText,
  type LucideIcon,
} from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { documentThumbUrl, documentUrl } from '@/lib/api/upload';

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

/** The photo, paper, video or voice note itself; it is also kept under Documents. */
function MessageFile({ file }: { readonly file: ChatFile }) {
  const url = documentUrl(file.id);
  if (file.contentType.startsWith('image/'))
    return (
      <a href={url} target="_blank" rel="noopener" className="block">
        {/* biome-ignore lint/performance/noImgElement: a stored file streamed by the API */}
        <img
          src={documentThumbUrl(file.id)}
          alt={file.name}
          className="max-h-56 rounded-lg object-cover"
        />
      </a>
    );
  if (file.contentType.startsWith('audio/'))
    // biome-ignore lint/a11y/useMediaCaption: a customer's voice note has no captions
    return <audio controls preload="none" src={url} className="w-64 max-w-full" />;
  if (file.contentType.startsWith('video/'))
    return (
      // biome-ignore lint/a11y/useMediaCaption: a customer's video has no captions
      <video controls preload="metadata" src={url} className="max-h-72 max-w-full rounded-lg" />
    );
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener"
      className="inline-flex items-center gap-2 text-accent underline underline-offset-2"
    >
      <FileText aria-hidden className="size-4 shrink-0" />
      {file.name}
    </a>
  );
}

/** Words worth showing beside a file: not the "(media)" stand-in or the file's own name. */
const caption = (message: ChatMessage) =>
  message.file && (message.body === `(${message.kind})` || message.body === message.file.name)
    ? ''
    : message.body;

/** Customer on the left, OneOhm on the right; ours say who sent them and how far they got. */
export function MessageBubble({ message }: { readonly message: ChatMessage }) {
  const t = useTranslations('service.whatsapp');
  const format = useFormatter();
  const outgoing = message.direction === 'out';
  // A line about the chat itself (the assistant took it back), never sent to the customer.
  if (message.kind === 'note')
    return (
      <li className="self-center px-1 text-center type-label text-ink-faint">{message.body}</li>
    );
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
        {message.file && <MessageFile file={message.file} />}
        {message.file && (
          <span className="mt-1 block type-label text-ink-faint">
            {message.file.filedAs ? t('filedAs', { where: message.file.filedAs }) : t('toSort')}
          </span>
        )}
        {caption(message) && (
          <span className={cn('block', message.file && 'mt-1.5')}>
            <RichText body={caption(message)} links={outgoing} />
          </span>
        )}
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
