'use client';

import type { LeadDetail } from '@oneohm/api-contracts';
import { Card, cn, Select } from '@oneohm/design-system/web';
import { formatKwp } from '@oneohm/shared';
import { CalendarClock } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { useCan } from '@/providers/current-user';
import { clockLabel, isOpenLead } from './lead-labels';
import { useUpdateLead } from './use-lead-mutations';
import { useLeadOwnerOptions } from './use-lead-owners';

/** The next follow-up, set large so it is never missed (PRD 3.3: no silent leads). */
export function FollowUpCard({
  lead,
  today,
}: {
  readonly lead: LeadDetail;
  readonly today: string;
}) {
  const t = useTranslations('leads.followUp');
  const format = useFormatter();
  if (!isOpenLead(lead)) return null;
  const isToday = lead.nextActionOn === today;
  return (
    <Card
      className={cn(
        'flex flex-col gap-2 rounded-[28px] p-5',
        lead.overdue && 'border-overdue/30 bg-overdue-tint/50',
        isToday && 'border-accent/30 bg-accent-soft/50',
      )}
    >
      <p className="flex items-center gap-2 type-overline text-ink-faint uppercase">
        <CalendarClock aria-hidden className="size-4" />
        {t('title')}
      </p>
      {lead.nextActionOn ? (
        <p
          className={cn(
            'type-display-md',
            lead.overdue ? 'text-overdue' : isToday ? 'text-accent' : 'text-ink',
          )}
        >
          {isToday
            ? t('today')
            : format.dateTime(new Date(lead.nextActionOn), {
                weekday: 'short',
                day: 'numeric',
                month: 'short',
              })}
          {lead.nextActionTime && ` · ${clockLabel(lead.nextActionTime)}`}
        </p>
      ) : (
        <p className="type-body text-ink-faint">{t('none')}</p>
      )}
      {lead.overdue && <p className="type-body-sm font-medium text-overdue">{t('overdue')}</p>}
      {lead.nextActionNote && <p className="type-body-sm text-ink-muted">{lead.nextActionNote}</p>}
    </Card>
  );
}

/** What we know about the lead, with the owner changeable by people who assign work. */
export function LeadFactsCard({ lead }: { readonly lead: LeadDetail }) {
  const t = useTranslations('leads');
  const canAssign = useCan('people.view', 'people.manage', 'tasks.assign', 'projects.manage');
  const canManage = useCan('leads.manage');
  const update = useUpdateLead(lead.id);
  const owners = useLeadOwnerOptions(canAssign && canManage);
  // The current owner stays listed even if they no longer work on leads.
  const ownerOptions =
    lead.owner && !owners.some((owner) => owner.value === lead.owner?.id)
      ? [{ value: lead.owner.id, label: lead.owner.fullName }, ...owners]
      : owners;

  return (
    <Card className="flex flex-col gap-1 rounded-[28px] p-5">
      <h2 className="mb-2 type-overline text-ink-faint uppercase">{t('facts.title')}</h2>
      <dl className="flex flex-col divide-y divide-hairline">
        <Fact label={t('facts.owner')}>
          {canAssign && canManage && ownerOptions.length > 0 ? (
            <Select
              label={t('facts.owner')}
              value={lead.owner?.id}
              placeholder={t('unassigned')}
              onValueChange={(ownerUserId) => update.mutate({ ownerUserId })}
              options={ownerOptions}
              className="h-9 w-48"
              disabled={update.isPending}
            />
          ) : (
            (lead.owner?.fullName ?? t('unassigned'))
          )}
        </Fact>
        <Fact label={t('facts.category')}>{t(`category.${lead.subsidyCategory}`)}</Fact>
        <Fact label={t('facts.size')}>{lead.estimatedWp ? formatKwp(lead.estimatedWp) : '—'}</Fact>
        <Fact label={t('facts.source')}>{t(`source.${lead.source}`)}</Fact>
        {lead.referredBy && <Fact label={t('facts.referredBy')}>{lead.referredBy.name}</Fact>}
        {lead.email && <Fact label={t('facts.email')}>{lead.email}</Fact>}
      </dl>
      {lead.notes && (
        <p className="mt-3 rounded-lg bg-sunken/70 px-3.5 py-3 type-body-sm whitespace-pre-line text-ink-muted">
          {lead.notes}
        </p>
      )}
    </Card>
  );
}

function Fact({ label, children }: { readonly label: string; readonly children: ReactNode }) {
  return (
    <div className="flex min-h-11 items-center justify-between gap-4 py-2">
      <dt className="type-body-sm text-ink-faint">{label}</dt>
      <dd className="min-w-0 truncate text-right type-body-sm text-ink">{children}</dd>
    </div>
  );
}
