'use client';

import type { LeadDetail } from '@oneohm/api-contracts';
import {
  Button,
  Card,
  Dialog,
  Field,
  Select,
  StatusPill,
  Textarea,
} from '@oneohm/design-system/web';
import { LEAD_STAGES, type LeadStage } from '@oneohm/domain';
import { addDays, todayIn } from '@oneohm/shared';
import { RotateCcw, XCircle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { ApiError } from '@/lib/api/api-error';
import { STAGE_TONE } from './lead-labels';
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
  const [losing, setLosing] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const lost = lead.stage === 'lost';

  const move = (stage: LeadStage) => {
    setError(null);
    update.mutate(
      { stage },
      {
        onError: (caught) => setError(caught instanceof ApiError ? caught.message : String(caught)),
      },
    );
  };
  const markLost = () =>
    update.mutate(
      { stage: 'lost', lostReason: reason.trim() },
      {
        onSuccess: () => {
          setLosing(false);
          setReason('');
        },
        onError: (caught) => setError(caught instanceof ApiError ? caught.message : String(caught)),
      },
    );
  const reopen = () =>
    update.mutate({ stage: 'contacted', nextActionOn: addDays(todayIn(), 1), lostReason: null });

  return (
    <Card className="flex flex-col gap-4 rounded-[28px] p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="type-overline text-ink-faint uppercase">{t('stageCard.title')}</h2>
        <StatusPill tone={STAGE_TONE[lead.stage]} label={t(`stage.${lead.stage}`)} size="sm" />
      </div>
      {lost ? (
        <div className="flex flex-col gap-3">
          <p className="type-body text-ink-muted">{lead.lostReason}</p>
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
              value={lead.stage}
              onValueChange={move}
              options={LEAD_STAGES.filter((stage) => stage !== 'lost').map((value) => ({
                value,
                label: t(`stage.${value}`),
              }))}
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
      <Dialog
        open={losing}
        onOpenChange={setLosing}
        title={t('stageCard.lostTitle')}
        description={t('stageCard.lostDescription')}
        size="sm"
        autoFocusField
        footer={
          <>
            <Button variant="quiet" onClick={() => setLosing(false)}>
              {t('create.cancel')}
            </Button>
            <Button
              variant="danger"
              onClick={markLost}
              disabled={!reason.trim()}
              pending={update.isPending}
            >
              {t('stageCard.lostSubmit')}
            </Button>
          </>
        }
      >
        <Field label={t('stageCard.lostReason')}>
          <Textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={3} />
        </Field>
      </Dialog>
    </Card>
  );
}
