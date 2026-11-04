'use client';

import type { ChatSummary } from '@oneohm/api-contracts';
import { Button, Textarea, useToast } from '@oneohm/design-system/web';
import { FOLLOW_UP_MAX } from '@oneohm/domain';
import { BellOff, Clock3, SendHorizontal } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { type FormEvent, type KeyboardEvent, useState } from 'react';
import { describeError } from '@/lib/api/api-error';
import { useReply } from './use-whatsapp';

/** A staff reply. Sending one quietens the assistant in this chat until it is handed back. */
export function ReplyBox({ chat }: { readonly chat: ChatSummary }) {
  const t = useTranslations('service.whatsapp');
  const toast = useToast();
  const reply = useReply(chat.id);
  const [draft, setDraft] = useState('');

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
      {/* They sent STOP: our messages (templates, nudges) wait until they send START. */}
      {chat.optedOut && (
        <p className="flex items-start gap-2 px-1 type-body-sm text-ink-muted">
          <BellOff aria-hidden className="mt-0.5 size-4 shrink-0 text-ink-faint" />
          {t('reply.optedOut')}
        </p>
      )}
      {/* After 24 hours WhatsApp needs a template: the app wraps the words in one. */}
      {!chat.windowOpen && (
        <p className="flex items-start gap-2 px-1 type-body-sm text-ink-muted">
          <Clock3 aria-hidden className="mt-0.5 size-4 shrink-0 text-ink-faint" />
          {t('reply.closed')}
        </p>
      )}
      <div className="flex items-end gap-2">
        <Textarea
          aria-label={t('reply.label')}
          aria-keyshortcuts="Control+Enter Meta+Enter"
          placeholder={chat.windowOpen ? t('reply.placeholder') : t('reply.followUpPlaceholder')}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={onKeyDown}
          readOnly={reply.isPending}
          rows={2}
          maxLength={chat.windowOpen ? 4000 : FOLLOW_UP_MAX}
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
