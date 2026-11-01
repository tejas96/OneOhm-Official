'use client';

import type { ChatSummary } from '@oneohm/api-contracts';
import { Button, Textarea, useToast } from '@oneohm/design-system/web';
import { Clock3, Phone, SendHorizontal } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { type FormEvent, type KeyboardEvent, useState } from 'react';
import { describeError } from '@/lib/api/api-error';
import { useReply } from './use-whatsapp';

/** WhatsApp's 24-hour window is shut: say so, and offer the phone instead. */
function WindowClosed({ phone }: { readonly phone: string }) {
  const t = useTranslations('service.whatsapp');
  return (
    <div className="flex flex-col gap-3 border-t border-hairline bg-raised px-4 py-3 sm:flex-row sm:items-center">
      <p className="flex flex-1 items-start gap-2 type-body-sm text-ink-muted">
        <Clock3 aria-hidden className="mt-0.5 size-4 shrink-0 text-ink-faint" />
        {t('reply.closed')}
      </p>
      <Button asChild size="sm" variant="secondary" className="self-start sm:self-auto">
        <a href={`tel:${phone}`}>
          <Phone aria-hidden className="size-4" />
          {t('call')}
        </a>
      </Button>
    </div>
  );
}

/** A staff reply. Sending one quietens the assistant in this chat until it is handed back. */
export function ReplyBox({ chat }: { readonly chat: ChatSummary }) {
  const t = useTranslations('service.whatsapp');
  const toast = useToast();
  const reply = useReply(chat.id);
  const [draft, setDraft] = useState('');

  if (!chat.windowOpen) return <WindowClosed phone={chat.phone} />;

  const submit = (event?: FormEvent) => {
    event?.preventDefault();
    const text = draft.trim();
    if (!text || reply.isPending) return;
    reply.mutate(text, {
      onSuccess: () => setDraft(''),
      onError: (error) =>
        toast({ tone: 'error', title: t('reply.failed'), description: describeError(error) }),
    });
  };
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) submit();
  };

  return (
    <form
      onSubmit={submit}
      className="flex flex-col gap-2 border-t border-hairline bg-raised px-3 py-3 sm:px-4"
    >
      <div className="flex items-end gap-2">
        <Textarea
          aria-label={t('reply.label')}
          aria-keyshortcuts="Control+Enter Meta+Enter"
          placeholder={t('reply.placeholder')}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={onKeyDown}
          readOnly={reply.isPending}
          rows={2}
          maxLength={4000}
          className="min-h-12 flex-1 resize-none"
        />
        <Button
          type="submit"
          variant="primary"
          leadingIcon={<SendHorizontal />}
          pending={reply.isPending}
          disabled={!draft.trim()}
        >
          {t('reply.send')}
        </Button>
      </div>
      <p className="flex flex-wrap justify-between gap-x-4 gap-y-1 px-1 type-label text-ink-faint">
        <span>{chat.state === 'human' ? null : t('reply.takeOver')}</span>
        <span className="max-sm:hidden">{t('reply.hint')}</span>
      </p>
    </form>
  );
}
