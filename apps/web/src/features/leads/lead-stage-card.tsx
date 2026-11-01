'use client';

import type { LeadDetail } from '@oneohm/api-contracts';
import { Button, Card, Select, StatusPill } from '@oneohm/design-system/web';
import { todayIn } from '@oneohm/shared';
import { CalendarClock, RotateCcw, XCircle } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { useState } from 'react';
import { useLeadSteps } from '@/features/settings/lead-steps/use-lead-steps';
import { ApiError } from '@/lib/api/api-error';
import { STAGE_TONE } from './lead-labels';
import { LostLeadDialog } from './lost-lead-dialog';
import { useUpdateLead } from './use-lead-mutations';

/** Where the lead stands, how to move it on, and closing it as lost with a reason. */
export function LeadStageCard({
  lead,
  canManage,
}: {
  readonly lead: LeadDetail;
  readonly canManage: boolean;
}) {
  const t = useTranslations('leads');
  const update = useUpdateLead(lead.id);
  const steps = useLeadSteps();
  const [losing, setLosing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lost = lead.stage === 'lost';

  const move = (value: string) => {
    setError(null);
    update.mutate(value === 'won' ? { stage: 'won' } : { stepKey: value }, {
      onError: (caught) => setError(caught instanceof ApiError ? caught.message : String(caught)),
    });
  };
  const reopen = () =>
    update.mutate(
      { stage: 'contacted', nextActionOn: todayIn() },
      {
        onError: (caught) => setError(caught instanceof ApiError ? caught.message : String(caught)),
      },
    );

  return (
    <Card className="flex flex-col gap-4 rounded-[28px] p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="type-overline text-ink-faint uppercase">{t('stageCard.title')}</h2>
        <StatusPill
          tone={STAGE_TONE[lead.stage]}
          label={lead.step?.name ?? t(`stage.${lead.stage}`)}
          size="sm"
        />
      </div>
      {lost ? (
        <div className="flex flex-col gap-3">
          <LostSummary lead={lead} />
          {canManage && (
            <Button
              variant="secondary"
              size="sm"
              leadingIcon={<RotateCcw />}
              onClick={reopen}
              pending={update.isPending}
              className="self-start"
            >
              {t('stageCard.reopen')}
            </Button>
          )}
        </div>
      ) : (
        canManage && (
          <div className="flex flex-col gap-3">
            <Select
              label={t('stageCard.move')}
              value={lead.step?.key ?? lead.stage}
              onValueChange={move}
              options={[
                ...(steps.data ?? [])
                  .filter((step) => step.active || step.key === lead.step?.key)
                  .map((step) => ({
                    value: step.key,
                    label: step.name,
                    description: t(`stage.${step.stage}`),
                  })),
                { value: 'won', label: t('stage.won') },
              ]}
              disabled={update.isPending}
            />
            <Button
              variant="quiet"
              size="sm"
              leadingIcon={<XCircle />}
              onClick={() => setLosing(true)}
              className="self-start text-overdue"
            >
              {t('stageCard.markLost')}
            </Button>
          </div>
        )
      )}
      {error && (
        <p role="alert" className="type-body-sm text-overdue">
          {error}
        </p>
      )}
      {canManage && <LostLeadDialog lead={lead} open={losing} onOpenChange={setLosing} />}
    </Card>
  );
}

/** Why the lead was lost, and when it comes back to the owner. */
function LostSummary({ lead }: { readonly lead: LeadDetail }) {
  const t = useTranslations('leads.lost');
  const format = useFormatter();
  const reason = lead.lostReasonKey ? t(`reasons.${lead.lostReasonKey}`) : null;
  return (
    <div className="flex flex-col gap-2">
      <p className="type-body text-ink">{reason ?? lead.lostReason}</p>
      {reason && lead.lostReason && (
        <p className="type-body-sm text-ink-muted">{lead.lostReason}</p>
      )}
      {lead.revisitOn && (
        <p
          className={`inline-flex items-center gap-1.5 type-body-sm ${lead.revisitDue ? 'font-medium text-accent' : 'text-ink-muted'}`}
        >
          <CalendarClock aria-hidden className="size-4" />
          {lead.revisitDue
            ? t('revisitDue')
            : t('revisitOnDate', {
                date: format.dateTime(new Date(lead.revisitOn), {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                }),
              })}
        </p>
      )}
    </div>
  );
}
