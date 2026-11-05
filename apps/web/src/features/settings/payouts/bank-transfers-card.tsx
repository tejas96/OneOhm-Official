'use client';

import type { PayoutIp, PayoutSetup } from '@oneohm/api-contracts';
import { Badge, Button, Card, StatusPill } from '@oneohm/design-system/web';
import { ArrowUpRight } from 'lucide-react';
import Link from 'next/link';
import { useFormatter, useNow, useTranslations } from 'next-intl';
import { ListSkeleton, LoadError } from '@/components/query-state';
import { PayoutMatchPanel } from './payout-match-panel';
import { ServerIpLine } from './server-ip-line';
import { type CheckKey, type CheckTone, setupChecks, setupStatus } from './setup-status';
import { usePayoutSetup } from './use-payout-setup';

const STATUS_TONE = {
  off: 'neutral',
  practice: 'waiting',
  liveTest: 'atRisk',
  live: 'onTrack',
} as const;

function Mark({ tone }: { readonly tone: CheckTone }) {
  const t = useTranslations('settings.bankTransfers');
  if (tone === 'ok') return <StatusPill size="sm" tone="onTrack" label={t('tone.ok')} />;
  if (tone === 'warn') return <StatusPill size="sm" tone="atRisk" label={t('tone.warn')} />;
  return <Badge variant="outline">{t('tone.idle')}</Badge>;
}

/** The plain-words detail line under each checklist item. */
function useDetail(setup: PayoutSetup & PayoutIp) {
  const t = useTranslations('settings.bankTransfers');
  const format = useFormatter();
  const now = useNow();
  const ago = (iso: string) => format.relativeTime(new Date(iso), now);
  const isSet = (value: boolean) => (value ? t('set') : t('notSet'));
  const lines: Readonly<Record<CheckKey, (tone: CheckTone) => string>> = {
    accountNumber: () => isSet(setup.accountNumberSet),
    keys: () =>
      setup.keysSet && setup.mode === 'live' && setup.keysAreTest
        ? t('testKeysInLive')
        : isSet(setup.keysSet),
    webhookSecret: () => isSet(setup.webhookSecretSet),
    lastWebhook: (tone) =>
      setup.lastWebhookAt
        ? ago(setup.lastWebhookAt)
        : tone === 'warn'
          ? t('noWebhookYetLive')
          : t('noWebhookYet'),
    lastCheck: () =>
      setup.lastCheckError
        ? t('checkFailed', { error: setup.lastCheckError })
        : setup.lastCheckAt
          ? ago(setup.lastCheckAt)
          : t('noCheckYet'),
    openPayouts: () => t('counts', { open: setup.openPayouts, stuck: setup.stuckPayouts }),
    lowBalance: (tone) =>
      !setup.lastLowBalanceAt
        ? t('lowBalanceNever')
        : t(tone === 'warn' ? 'lowBalanceOpen' : 'lowBalancePast', {
            when: ago(setup.lastLowBalanceAt),
          }),
    allowList: () => t('allowListBlocked'),
  };
  return (key: CheckKey, tone: CheckTone): string => lines[key](tone);
}

function Checklist({ setup }: { readonly setup: PayoutSetup & PayoutIp }) {
  const t = useTranslations('settings.bankTransfers');
  const detail = useDetail(setup);
  return (
    <ul className="flex flex-col divide-y divide-hairline">
      {setupChecks(setup).map((check) => (
        <li
          key={check.key}
          className="flex flex-col gap-1.5 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-start sm:justify-between sm:gap-4"
        >
          <div className="flex min-w-0 flex-col gap-0.5">
            <p className="type-label text-ink">{t(`items.${check.key}`)}</p>
            <p className="type-body-sm break-words text-ink-muted">
              {detail(check.key, check.tone)}
            </p>
          </div>
          <span className="shrink-0">
            <Mark tone={check.tone} />
          </span>
        </li>
      ))}
    </ul>
  );
}

/**
 * Settings → Payments: is the RazorpayX setup right (spec U15)? Read only — keys and
 * secrets live in the server settings and are never shown.
 */
export function BankTransfersCard() {
  const t = useTranslations('settings.bankTransfers');
  const setup = usePayoutSetup();
  return (
    <Card className="flex flex-col gap-5 p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex flex-col gap-1">
          <h3 className="type-title-md text-ink">{t('title')}</h3>
          <p className="max-w-2xl type-body-sm text-ink-muted">{t('intro')}</p>
        </div>
        {setup.data && (
          <StatusPill
            tone={STATUS_TONE[setupStatus(setup.data)]}
            label={t(`status.${setupStatus(setup.data)}`)}
          />
        )}
      </div>
      {setup.isPending && <ListSkeleton label={t('loading')} rows={4} />}
      {setup.isError && <LoadError error={setup.error} onRetry={() => setup.refetch()} />}
      {setup.data && (
        <>
          <p className="rounded-md bg-sunken px-4 py-3 type-body-sm text-ink-muted">
            {t(`statusNote.${setupStatus(setup.data)}`)}
          </p>
          <Checklist setup={setup.data} />
          {setup.data.mode === 'live' && setup.data.serverIp && (
            <ServerIpLine ip={setup.data.serverIp} />
          )}
          {setup.data.mode !== 'off' && <PayoutMatchPanel />}
          <p className="type-body-sm text-ink-faint">{t('secretsNote')}</p>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" asChild>
              <Link href="/finance?tab=payables">
                {t('openTransfers')}
                <ArrowUpRight aria-hidden />
              </Link>
            </Button>
            <Button
              variant="quiet"
              size="sm"
              onClick={() => setup.refetch()}
              pending={setup.isFetching}
            >
              {t('refresh')}
            </Button>
          </div>
        </>
      )}
    </Card>
  );
}
