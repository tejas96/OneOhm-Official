'use client';

import type { LeadDetail } from '@oneohm/api-contracts';
import { Button, Dialog, Field, Input, Select, Textarea } from '@oneohm/design-system/web';
import { LEAD_LOST_REASONS, type LeadLostReason } from '@oneohm/domain';
import { addDays, todayIn } from '@oneohm/shared';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { ApiError } from '@/lib/api/api-error';
import { useUpdateLead } from './use-lead-mutations';

/**
 * Close a lead as lost: why, from a short list (words for "other"), and an optional day
 * to try again. On that day the lead comes back to the owner's follow-ups (PRD 3.3).
 */
export function LostLeadDialog({
  lead,
  open,
  onOpenChange,
}: {
  readonly lead: LeadDetail;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations('leads.lost');
  const update = useUpdateLead(lead.id);
  const [reason, setReason] = useState<LeadLostReason | undefined>(undefined);
  const [words, setWords] = useState('');
  const [revisitOn, setRevisitOn] = useState('');
  const [error, setError] = useState<ApiError | null>(null);
  const ready = reason !== undefined && (reason !== 'other' || words.trim().length > 0);

  const close = (next: boolean) => {
    if (!next) {
      setError(null);
      setReason(undefined);
      setWords('');
      setRevisitOn('');
    }
    onOpenChange(next);
  };
  const submit = () => {
    if (!reason) return;
    setError(null);
    update.mutate(
      {
        stage: 'lost',
        lostReasonKey: reason,
        lostReason: words.trim() || null,
        revisitOn: revisitOn || null,
      },
      {
        onSuccess: () => close(false),
        onError: (caught) => setError(caught instanceof ApiError ? caught : null),
      },
    );
  };

  return (
    <Dialog
      open={open}
      onOpenChange={close}
      title={t('title')}
      description={t('description')}
      size="sm"
      footer={
        <>
          <Button variant="quiet" onClick={() => close(false)}>
            {t('cancel')}
          </Button>
          <Button variant="danger" onClick={submit} disabled={!ready} pending={update.isPending}>
            {t('submit')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4 py-1">
        <Field label={t('reason')} required error={error?.fieldErrors.lostReasonKey}>
          <Select
            value={reason}
            onValueChange={setReason}
            placeholder={t('reasonPlaceholder')}
            options={LEAD_LOST_REASONS.map((value) => ({ value, label: t(`reasons.${value}`) }))}
          />
        </Field>
        <Field
          label={reason === 'other' ? t('words') : t('wordsOptional')}
          required={reason === 'other'}
          error={error?.fieldErrors.lostReason}
        >
          <Textarea value={words} onChange={(event) => setWords(event.target.value)} rows={2} />
        </Field>
        <Field label={t('revisitOn')} hint={t('revisitHint')} error={error?.fieldErrors.revisitOn}>
          <Input
            type="date"
            min={addDays(todayIn(), 1)}
            value={revisitOn}
            onChange={(event) => setRevisitOn(event.target.value)}
          />
        </Field>
        {error && Object.keys(error.fieldErrors).length === 0 && (
          <p role="alert" className="type-body-sm text-overdue">
            {error.message}
          </p>
        )}
      </div>
    </Dialog>
  );
}
