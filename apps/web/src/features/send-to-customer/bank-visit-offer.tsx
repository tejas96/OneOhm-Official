'use client';

import type { SendOffer, SendRequest, SendScope } from '@oneohm/api-contracts';
import { Button, Field, Input } from '@oneohm/design-system/web';
import { todayIn } from '@oneohm/shared';
import { Send } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { PreviewBubble } from './send-offer-card';
import { useSendAction, useSendPreview } from './use-send-to-customer';

/** "Sign the loan papers at the bank": the person gives the branch and the day, and sees what the customer gets. */
export function BankVisitOffer({
  offer,
  scope,
  onSent,
}: {
  readonly offer: SendOffer;
  readonly scope: SendScope;
  readonly onSent: () => void;
}) {
  const t = useTranslations('sendToCustomer');
  const send = useSendAction(scope);
  const previewing = useSendPreview();
  const [branch, setBranch] = useState('');
  const [day, setDay] = useState('');
  const projectId = scope.projectId;
  const ready = Boolean(projectId) && branch.trim().length >= 2 && /^\d{4}-\d{2}-\d{2}$/.test(day);
  const request: SendRequest | null =
    ready && projectId ? { action: 'ask_bank_sign', projectId, branch: branch.trim(), day } : null;
  // The preview follows what is typed, a moment after the last key.
  const scopeNow = useRef(scope);
  scopeNow.current = scope;
  const { mutate: showPreview } = previewing;
  useEffect(() => {
    if (!request) return;
    const wait = setTimeout(() => showPreview({ scope: scopeNow.current, request }), 400);
    return () => clearTimeout(wait);
  }, [request, showPreview]);
  return (
    <li className="flex flex-col gap-3 py-4">
      <div className="flex flex-col gap-0.5">
        <span className="type-body-sm font-medium text-ink">{offer.label}</span>
        <span className="type-body-sm text-ink-faint">{offer.detail}</span>
      </div>
      <Field label={t('bank.branch')} hint={t('bank.branchHint')}>
        <Input
          value={branch}
          onChange={(event) => setBranch(event.target.value)}
          placeholder={t('bank.branchPlaceholder')}
          maxLength={80}
          disabled={send.isPending}
        />
      </Field>
      <Field label={t('bank.day')}>
        <Input
          type="date"
          min={todayIn()}
          value={day}
          onChange={(event) => setDay(event.target.value)}
          disabled={send.isPending}
        />
      </Field>
      {request && previewing.data ? (
        <PreviewBubble preview={previewing.data} />
      ) : (
        request &&
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
