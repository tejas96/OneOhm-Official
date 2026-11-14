'use client';

import type { LeadDetail, SetVisit, VisitsOf } from '@oneohm/api-contracts';
import { Button, Dialog, Field, Select } from '@oneohm/design-system/web';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useFormatter, useTranslations } from 'next-intl';
import { useState } from 'react';
import { visitsKey } from '@/features/visits/use-visits';
import { api, expectStatus } from '@/lib/api/api-client';
import { ApiError, describeError } from '@/lib/api/api-error';
import { useUpdateLead } from './use-lead-mutations';

const DAY = { weekday: 'short', day: 'numeric', month: 'short' } as const;
const REFRESHED = [['visits'], ['document-requests'], ['projects'], ['leads']] as const;

/**
 * Picking "Survey booked" for a lead asks for the day and time of the survey. Booking here is
 * the Visit card's own booking (calendar, customer told on WhatsApp, next action) and then the
 * step is set. Cancel, or a booking that fails, leaves the stage as it was.
 */
export function SurveyBookingDialog({
  lead,
  stepKey,
  data,
  open,
  onOpenChange,
}: {
  readonly lead: LeadDetail;
  /** The step the user picked. */
  readonly stepKey: string;
  readonly data: VisitsOf | undefined;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations('leads.surveyDialog');
  const tv = useTranslations('visits');
  const format = useFormatter();
  const client = useQueryClient();
  const update = useUpdateLead(lead.id);
  const [day, setDay] = useState('');
  const [start, setStart] = useState('');
  const [error, setError] = useState<string | null>(null);

  const book = useMutation({
    mutationFn: (when: Pick<SetVisit, 'day' | 'slot' | 'startMin'>) =>
      expectStatus(api.visits.setVisit({ body: { leadId: lead.id, ...when } }), 200),
  });
  const pending = book.isPending || update.isPending;

  const freeDays = data?.freeDays ?? [];
  const chosenDay = freeDays.includes(day) ? day : (freeDays[0] ?? '');
  const times = (data?.freeTimes[chosenDay] ?? []).map((one) => ({
    value: String(one.startMin),
    label: one.label,
  }));
  const chosen = times.some((one) => one.value === start) ? start : (times[0]?.value ?? '');
  const days = freeDays.map((value) => ({
    value,
    label: format.dateTime(new Date(`${value}T00:00:00Z`), { ...DAY, timeZone: 'UTC' }),
  }));

  const close = (next: boolean) => {
    if (pending) return;
    if (!next) {
      setError(null);
      setDay('');
      setStart('');
    }
    onOpenChange(next);
  };
  const message = (caught: unknown) =>
    caught instanceof ApiError ? caught.message : describeError(caught);
  const refresh = () =>
    Promise.all([
      ...REFRESHED.map((queryKey) => client.invalidateQueries({ queryKey: [...queryKey] })),
      client.invalidateQueries({ queryKey: visitsKey({ leadId: lead.id }) }),
    ]);

  const submit = async () => {
    if (pending || !chosenDay || !chosen) return;
    setError(null);
    try {
      await book.mutateAsync({
        day: chosenDay,
        slot: Number(chosen) < 720 ? 'morning' : 'afternoon',
        startMin: Number(chosen),
      });
    } catch (caught) {
      // Slot taken, a day off or any other refusal: nothing was booked and the stage stays.
      setError(message(caught));
      await refresh();
      return;
    }
    try {
      await update.mutateAsync({ stepKey });
    } catch (caught) {
      setError(t('bookedNotMoved', { reason: message(caught) }));
      await refresh();
      return;
    }
    await refresh();
    close(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={close}
      title={t('title')}
      description={t('description', { name: lead.name })}
      size="sm"
      footer={
        <>
          <Button variant="quiet" onClick={() => close(false)} disabled={pending}>
            {t('cancel')}
          </Button>
          <Button onClick={submit} disabled={!chosenDay || !chosen} pending={pending}>
            {tv('book')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4 py-1">
        {!data?.customerMessages && data && (
          <p className="type-body-sm text-ink-muted">{tv('noMessages')}</p>
        )}
        <Field label={tv('day')}>
          <Select
            value={chosenDay || undefined}
            onValueChange={setDay}
            options={days}
            placeholder={data ? tv('noFreeDay') : t('loading')}
          />
        </Field>
        <Field label={tv('time')}>
          <Select
            value={chosen || undefined}
            onValueChange={setStart}
            options={times}
            placeholder={tv('noFreeTime')}
          />
        </Field>
        {error && (
          <p role="alert" className="type-body-sm text-overdue">
            {error}
          </p>
        )}
      </div>
    </Dialog>
  );
}
