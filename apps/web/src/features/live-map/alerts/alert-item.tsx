'use client';

import type { DutyAlert } from '@oneohm/api-contracts';
import { Button, cn } from '@oneohm/design-system/web';
import { CalendarDays, Check, MessageCircle, Phone, Send } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { whatsappHref } from '../live-format';
import { canSendNearest } from './alert-format';
import { AlertIcon, useAlertWords } from './alert-words';

interface AlertItemProps {
  readonly alert: DutyAlert;
  readonly now: number;
  readonly focused: boolean;
  readonly onFocus: () => void;
  readonly onOpenDay: () => void;
  readonly onSendNearest: () => void;
  readonly onSeen: () => void;
  readonly onResolve: () => void;
}

/**
 * One alert: what happened in plain words, who, where and when, and the buttons that act on
 * it in one tap. Tapping the words shows the person or site on the map.
 */
export function AlertItem(props: AlertItemProps) {
  const { alert, focused } = props;
  const t = useTranslations('liveMap.alerts');
  const words = useAlertWords();
  const red = alert.severity === 'red';
  const phone = alert.person.phone;
  // "Customer says the visit did not happen": the first call is to the customer (Duty Day step 6).
  const customerPhone =
    alert.kind === 'visit_customer_no' && typeof alert.detail.customerPhone === 'string'
      ? alert.detail.customerPhone
      : null;
  return (
    <article
      data-severity={alert.severity}
      data-focused={focused || undefined}
      className={cn(
        'live-alert relative flex flex-col gap-3 rounded-2xl border px-3.5 py-3 transition-[background-color,border-color,box-shadow] duration-(--duration-fast)',
        focused
          ? 'border-[color-mix(in_oklab,var(--tone)_55%,transparent)] bg-[color-mix(in_oklab,var(--tone)_7%,var(--oh-raised))] shadow-e2'
          : 'border-hairline bg-raised',
      )}
    >
      <button
        type="button"
        onClick={props.onFocus}
        className="-m-1 flex items-start gap-3 rounded-xl p-1 text-left focus-visible:outline-2 focus-visible:outline-focus"
        aria-label={t('showOnMap', { title: words.title(alert) })}
      >
        <span
          aria-hidden
          className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl bg-[color-mix(in_oklab,var(--tone)_14%,transparent)] text-(--tone) [&_svg]:size-[1.125rem]"
        >
          <AlertIcon kind={alert.kind} />
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="flex items-start justify-between gap-2">
            <span className="type-body font-semibold text-ink">{words.title(alert)}</span>
            {!alert.seenAt && (
              <span className="mt-2 size-2 shrink-0 rounded-full bg-(--tone)">
                <span className="sr-only">{t('new')}</span>
              </span>
            )}
          </span>
          <span className="truncate type-body-sm text-ink">{alert.person.fullName}</span>
          <span className="flex flex-wrap items-baseline gap-x-2 type-label text-ink-muted">
            {words.where(alert) && <span className="min-w-0 truncate">{words.where(alert)}</span>}
            <span className="tabular-nums text-ink-faint">
              {words.ago(alert.createdAt, props.now)}
            </span>
          </span>
        </span>
      </button>
      <div className="flex flex-wrap items-center gap-1.5">
        {canSendNearest(alert) && (
          <Button size="sm" variant="primary" leadingIcon={<Send />} onClick={props.onSendNearest}>
            {t('sendNearest')}
          </Button>
        )}
        {customerPhone && (
          <Button
            asChild
            size="sm"
            variant="primary"
            aria-label={t('callCustomerName', { name: String(alert.detail.customerName ?? '') })}
          >
            <a href={`tel:${customerPhone}`}>
              <Phone aria-hidden className="size-4" />
              {t('callCustomer')}
            </a>
          </Button>
        )}
        {phone && (
          <>
            <Button
              asChild
              size="sm"
              variant={red && !canSendNearest(alert) && !customerPhone ? 'primary' : 'secondary'}
              aria-label={t('callName', { name: alert.person.fullName })}
            >
              <a href={`tel:${phone}`}>
                <Phone aria-hidden className="size-4" />
                {t('call')}
              </a>
            </Button>
            <Button
              asChild
              size="sm"
              variant="secondary"
              aria-label={t('whatsappName', { name: alert.person.fullName })}
            >
              <a href={whatsappHref(phone)} target="_blank" rel="noreferrer">
                <MessageCircle aria-hidden className="size-4" />
                <span className="sr-only">{t('whatsapp')}</span>
              </a>
            </Button>
          </>
        )}
        <Button size="sm" variant="quiet" leadingIcon={<CalendarDays />} onClick={props.onOpenDay}>
          {t('openDay')}
        </Button>
        <span className="ml-auto flex items-center gap-1">
          {!alert.seenAt && (
            <Button size="sm" variant="quiet" onClick={props.onSeen}>
              {t('seen')}
            </Button>
          )}
          <Button size="sm" variant="quiet" leadingIcon={<Check />} onClick={props.onResolve}>
            {t('resolve')}
          </Button>
        </span>
      </div>
    </article>
  );
}
