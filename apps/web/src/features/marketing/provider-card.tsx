'use client';

import type { MarketingConnection } from '@oneohm/api-contracts';
import { Button, Card, Popover, Select, StatusPill } from '@oneohm/design-system/web';
import { formatInr } from '@oneohm/shared';
import { ExternalLink, TriangleAlert } from 'lucide-react';
import { useFormatter, useNow, useTranslations } from 'next-intl';
import { useState } from 'react';
import { CONNECTION_TONE, tokenNeedsWarning } from './marketing-words';
import { useConnectionActions } from './use-connection-actions';

function Chooser({
  provider,
  choose,
}: {
  readonly provider: 'meta' | 'google';
  readonly choose: NonNullable<MarketingConnection['choose']>;
}) {
  const t = useTranslations('marketing');
  const { choose: save } = useConnectionActions();
  const [account, setAccount] = useState(choose.accounts[0]?.id);
  const [page, setPage] = useState(choose.pages[0]?.id);
  const options = (list: typeof choose.accounts) =>
    list.map((item) => ({
      value: item.id,
      label: item.name,
      ...(item.note ? { description: item.note } : {}),
    }));
  return (
    <div className="flex flex-col gap-3">
      <p className="type-body text-ink">{t('connections.chooseIntro')}</p>
      <Select
        label={t('connections.adAccount')}
        value={account}
        onValueChange={setAccount}
        options={options(choose.accounts)}
      />
      {provider === 'meta' && choose.pages.length > 0 && (
        <Select
          label={t('connections.page')}
          value={page}
          onValueChange={setPage}
          options={options(choose.pages)}
        />
      )}
      <Button
        variant="primary"
        className="self-start"
        pending={save.isPending}
        disabled={!account}
        onClick={() =>
          account &&
          save.mutate({ provider, accountId: account, ...(page ? { pageId: page } : {}) })
        }
      >
        {t('connections.useThese')}
      </Button>
    </div>
  );
}

function Connected({ connection }: { readonly connection: MarketingConnection }) {
  const t = useTranslations('marketing');
  const format = useFormatter();
  const now = useNow();
  const { disconnect } = useConnectionActions();
  const [asking, setAsking] = useState(false);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-0.5">
        <p className="type-body font-medium text-ink">{connection.accountName}</p>
        {connection.extra && <p className="type-body-sm text-ink-muted">{connection.extra}</p>}
      </div>
      {connection.balancePaise !== null && (
        <div className="flex flex-wrap items-center gap-3">
          <p className="type-body text-ink">
            {t('connections.balance', { amount: formatInr(connection.balancePaise) })}
          </p>
          {connection.topUpUrl && (
            <Button asChild size="sm" variant="secondary" trailingIcon={<ExternalLink />}>
              <a href={connection.topUpUrl} target="_blank" rel="noopener noreferrer">
                {t('connections.addMoney')}
              </a>
            </Button>
          )}
        </div>
      )}
      {connection.tokenExpiresAt && tokenNeedsWarning(connection.tokenExpiresAt, now) && (
        <p className="flex items-start gap-2 rounded-md bg-at-risk-tint px-3 py-2 type-body-sm text-at-risk">
          <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
          {t('connections.tokenSoon', {
            date: format.dateTime(new Date(connection.tokenExpiresAt), {
              day: 'numeric',
              month: 'short',
            }),
          })}
        </p>
      )}
      <Popover
        label={t('connections.disconnect')}
        open={asking}
        onOpenChange={setAsking}
        trigger={
          <Button size="sm" variant="quiet" className="self-start">
            {t('connections.disconnect')}
          </Button>
        }
      >
        <div className="flex w-64 flex-col gap-3">
          <p className="type-body text-ink">{t('connections.disconnectAsk')}</p>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="danger"
              pending={disconnect.isPending}
              onClick={() => {
                setAsking(false);
                disconnect.mutate(connection.provider);
              }}
            >
              {t('connections.disconnectYes')}
            </Button>
            <Button size="sm" variant="quiet" onClick={() => setAsking(false)}>
              {t('actions.keep')}
            </Button>
          </div>
        </div>
      </Popover>
    </div>
  );
}

/** Meta or Google: where it stands in plain words, and the one thing to do next. */
export function ProviderCard({ connection }: { readonly connection: MarketingConnection }) {
  const t = useTranslations('marketing');
  const { start } = useConnectionActions();
  const name = t(`provider.${connection.provider}`);
  const status = connection.status;
  const blocked = connection.missingSettings.length > 0;
  return (
    <Card className="flex flex-col gap-4 p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <h2 className="type-title-md text-ink">{name}</h2>
          <p className="type-body-sm text-ink-muted">
            {t(`connections.${connection.provider}Covers`)}
          </p>
        </div>
        <StatusPill tone={CONNECTION_TONE[status]} size="sm" label={t(`connection.${status}`)} />
      </div>
      {blocked ? (
        <p className="rounded-md bg-sunken/70 px-3 py-2 type-body-sm text-ink-muted">
          {t('connections.needsSettings', { names: connection.missingSettings.join(', ') })}
        </p>
      ) : connection.choose ? (
        <Chooser provider={connection.provider} choose={connection.choose} />
      ) : status === 'connected' || status === 'in_review' ? (
        <Connected connection={connection} />
      ) : (
        <div className="flex flex-col gap-3">
          {connection.lastError && (
            <p className="type-body-sm text-overdue">{connection.lastError}</p>
          )}
          <Button
            variant="primary"
            className="self-start"
            pending={start.isPending}
            onClick={() => start.mutate(connection.provider)}
          >
            {t(status === 'needs_attention' ? 'connections.reconnect' : 'connections.connect', {
              place: name,
            })}
          </Button>
        </div>
      )}
      {!blocked && connection.waitingFor.length > 0 && (
        <div className="flex flex-col gap-1 rounded-md bg-review-tint px-3 py-2">
          <p className="type-body-sm font-medium text-review">
            {t('connections.waitingFor', { place: name })}
          </p>
          <ul className="list-disc pl-5 type-body-sm text-ink-muted">
            {connection.waitingFor.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      )}
      {status === 'in_review' && connection.lastError && (
        <p className="type-body-sm text-ink-muted">{connection.lastError}</p>
      )}
    </Card>
  );
}
