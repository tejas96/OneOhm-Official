'use client';

import type { LeadCampaignRecord } from '@oneohm/api-contracts';
import { Button, IconButton, Switch } from '@oneohm/design-system/web';
import { Pencil, Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { ListSkeleton, LoadError } from '@/components/query-state';
import { CampaignDialog, type CampaignDraft } from './campaign-dialog';
import { useChangeLeadCampaigns, useLeadCampaigns } from './use-lead-campaigns';

/**
 * Ad and campaign codes: the short codes an ad link or a WhatsApp opening line carries, so
 * each lead shows which campaign brought it. Not the referral campaign under Refer and earn.
 */
export function LeadCampaignsPanel() {
  const t = useTranslations('settings.leadCampaigns');
  const query = useLeadCampaigns();
  const change = useChangeLeadCampaigns();
  const [draft, setDraft] = useState<CampaignDraft | null>(null);
  if (query.isPending) return <ListSkeleton label={t('loading')} rows={4} />;
  if (query.isError) return <LoadError error={query.error} onRetry={() => query.refetch()} />;
  return (
    <div className="flex max-w-3xl flex-col gap-5">
      <p className="max-w-2xl type-body text-ink-muted">{t('intro')}</p>
      {query.data.length === 0 ? (
        <p className="type-body text-ink-muted">{t('empty')}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-hairline rounded-lg border border-hairline bg-raised">
          {query.data.map((campaign) => (
            <CampaignRow
              key={campaign.code}
              campaign={campaign}
              busy={change.isPending}
              onToggle={(active) =>
                change.mutate({ kind: 'update', code: campaign.code, body: { active } })
              }
              onEdit={() => setDraft({ campaign })}
            />
          ))}
        </ul>
      )}
      <Button
        size="sm"
        leadingIcon={<Plus />}
        className="self-start"
        onClick={() => setDraft({ campaign: null })}
      >
        {t('add')}
      </Button>
      <CampaignDialog draft={draft} onClose={() => setDraft(null)} />
    </div>
  );
}

function CampaignRow({
  campaign,
  busy,
  onToggle,
  onEdit,
}: {
  readonly campaign: LeadCampaignRecord;
  readonly busy: boolean;
  readonly onToggle: (active: boolean) => void;
  readonly onEdit: () => void;
}) {
  const t = useTranslations('settings.leadCampaigns');
  return (
    <li className="flex items-center gap-1 py-1 pr-2 pl-4">
      <Switch
        className="min-w-0 flex-1"
        checked={campaign.active}
        disabled={busy}
        onCheckedChange={onToggle}
        label={`${campaign.code} · ${campaign.name}`}
        description={t('leads', { count: campaign.leads })}
      />
      <IconButton size="sm" label={t('edit', { code: campaign.code })} onClick={onEdit}>
        <Pencil aria-hidden />
      </IconButton>
    </li>
  );
}
