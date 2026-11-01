'use client';

import type { ChatSummary } from '@oneohm/api-contracts';
import { Avatar, Button, IconButton, useToast } from '@oneohm/design-system/web';
import { ArrowLeft, Bot, Phone, UserRound } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { describeError } from '@/lib/api/api-error';
import { formatPhone, swatchFor } from '@/lib/format/contact';
import { useAgo } from '../use-ago';
import { useRelease } from './use-whatsapp';

/** Back to the chat list; only on phones, where one pane shows at a time. */
export function BackButton({ onBack }: { readonly onBack: () => void }) {
  const t = useTranslations('service.whatsapp');
  return (
    <IconButton label={t('back')} onClick={onBack} className="-ml-2 lg:hidden">
      <ArrowLeft aria-hidden />
    </IconButton>
  );
}

/** Who the chat is with, who is answering, and the way back to the assistant. */
export function ConversationHeader({
  chat,
  onBack,
}: {
  readonly chat: ChatSummary;
  readonly onBack: () => void;
}) {
  const t = useTranslations('service.whatsapp');
  const ago = useAgo();
  const toast = useToast();
  const release = useRelease(chat.id);
  const human = chat.state === 'human';

  const handBack = () =>
    release.mutate(undefined, {
      onSuccess: () => toast({ tone: 'success', title: t('handedBack') }),
      onError: (error) =>
        toast({ tone: 'error', title: t('handBackFailed'), description: describeError(error) }),
    });

  return (
    <header className="flex flex-wrap items-center gap-x-3 gap-y-3 border-b border-hairline px-4 py-3">
      <div className="flex min-w-0 flex-1 basis-56 items-center gap-3">
        <BackButton onBack={onBack} />
        <span aria-hidden>
          <Avatar name={chat.name} swatch={swatchFor(chat.id)} />
        </span>
        <div className="flex min-w-0 flex-col">
          <h2 className="truncate type-title-md text-ink">{chat.name}</h2>
          <a
            href={`tel:${chat.phone}`}
            className="inline-flex items-center gap-1 self-start type-body-sm text-ink-muted tabular-nums hover:text-accent"
          >
            <Phone aria-hidden className="size-3.5" />
            {formatPhone(chat.phone)}
          </a>
          <p className="type-label text-ink-faint">
            {human && chat.handedOverAt
              ? t('personSince', { time: ago(chat.handedOverAt) })
              : t('assistantOn')}
          </p>
        </div>
      </div>
      {(chat.customerId || human) && (
        <div className="flex flex-wrap items-center gap-2">
          {chat.customerId && (
            <Button asChild size="sm" variant="quiet">
              <Link href={`/customers/${chat.customerId}`}>
                <UserRound aria-hidden className="size-4" />
                <span className="sm:hidden">{t('customerShort')}</span>
                <span className="max-sm:hidden">{t('openCustomer')}</span>
              </Link>
            </Button>
          )}
          {human && (
            <Button
              size="sm"
              variant="secondary"
              leadingIcon={<Bot />}
              pending={release.isPending}
              onClick={handBack}
            >
              {t('handBack')}
            </Button>
          )}
        </div>
      )}
    </header>
  );
}
