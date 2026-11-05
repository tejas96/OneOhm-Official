'use client';

import type { SendOffer, SendPreview, SendScope } from '@oneohm/api-contracts';
import { Button, Field, Textarea } from '@oneohm/design-system/web';
import { Send } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { useSendAction, useSendPreview } from './use-send-to-customer';

const VIA_LABEL = {
  chat: 'viaChat',
  template: 'viaTemplate',
  sms: 'viaSms',
  in_person: 'viaInPerson',
} as const;

/** What the customer gets: the words as a chat bubble, the buttons under it, and how it travels. */
export function PreviewBubble({ preview }: { readonly preview: SendPreview }) {
  const t = useTranslations('sendToCustomer');
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-hairline bg-sunken px-4 py-3">
      <p className="type-label text-ink-faint">
        {t('customerGets')} · {t(`language.${preview.language}`)} · {t(VIA_LABEL[preview.via])}
      </p>
      <p className="whitespace-pre-line type-body-sm text-ink">{preview.body}</p>
      {preview.buttons.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {preview.buttons.map((button) => (
            <li
              key={button}
              className="rounded-full border border-hairline bg-surface px-3 py-1 type-body-sm text-accent"
            >
              {button}
            </li>
          ))}
        </ul>
      )}
      {preview.note && <p className="type-body-sm text-ink-muted">{preview.note}</p>}
    </div>
  );
}

/** One thing that can be sent: its name, the preview, and Send. A delay notice asks for the reason first. */
export function OfferCard({
  offer,
  scope,
  taskId,
  onSent,
}: {
  readonly offer: SendOffer;
  readonly scope: SendScope;
  /** The waiting task a delay notice is about. */
  readonly taskId: string | null;
  readonly onSent: () => void;
}) {
  const t = useTranslations('sendToCustomer');
  const send = useSendAction(scope);
  const previewing = useSendPreview();
  const [reason, setReason] = useState('');
  const asksReason = offer.input === 'reason';
  const request =
    offer.request ??
    (asksReason && taskId && reason.trim().length >= 2
      ? ({ action: 'delay_notice', taskId, reason: reason.trim() } as const)
      : null);
  // The preview follows what is typed, a moment after the last key.
  const text = reason.trim();
  const scopeNow = useRef(scope);
  scopeNow.current = scope;
  const { mutate: showPreview } = previewing;
  useEffect(() => {
    if (!asksReason || !taskId || text.length < 2) return;
    const wait = setTimeout(
      () =>
        showPreview({
          scope: scopeNow.current,
          request: { action: 'delay_notice', taskId, reason: text },
        }),
      400,
    );
    return () => clearTimeout(wait);
  }, [asksReason, taskId, text, showPreview]);
  const preview = asksReason ? (text.length >= 2 ? previewing.data : null) : offer.preview;
  return (
    <li className="flex flex-col gap-3 py-4">
      <div className="flex flex-col gap-0.5">
        <span className="type-body-sm font-medium text-ink">{offer.label}</span>
        <span className="type-body-sm text-ink-faint">{offer.detail}</span>
      </div>
      {asksReason && (
        <Field label={t('reason')} hint={t('reasonHint')}>
          <Textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder={t('reasonPlaceholder')}
            maxLength={200}
            rows={2}
            disabled={send.isPending}
          />
        </Field>
      )}
      {preview ? (
        <PreviewBubble preview={preview} />
      ) : (
        asksReason &&
        previewing.isPending && <p className="type-body-sm text-ink-muted">{t('previewLoading')}</p>
      )}
      <Button
        size="sm"
        variant="primary"
        className="self-start"
        leadingIcon={<Send />}
        pending={send.isPending}
        disabled={!request}
        onClick={() => request && send.mutate(request, { onSuccess: onSent })}
      >
        {t('send')}
      </Button>
    </li>
  );
}
