'use client';

import type { Visit, VisitScope, VisitsOf } from '@oneohm/api-contracts';
import { Button, Field, Input, type PillTone, Select, StatusPill } from '@oneohm/design-system/web';
import { todayIn } from '@oneohm/shared';
import { CalendarCheck, Check, X } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { useState } from 'react';
import { useSendAction } from '@/features/send-to-customer/use-send-to-customer';
import { useCan } from '@/providers/current-user';
import { useVisitMutations, useVisits } from './use-visits';

const SLOTS = ['morning', 'afternoon'] as const;
const DAY = { weekday: 'short', day: 'numeric', month: 'short' } as const;
const OPEN = new Set(['proposed', 'confirmed']);

const TONE: Readonly<Record<Visit['status'], PillTone>> = {
  proposed: 'review',
  confirmed: 'done',
  done: 'done',
  cancelled: 'neutral',
  missed: 'atRisk',
};

/**
 * The visit to the customer's home for a task, a lead's survey or a service request (redesign
 * §8): what the customer picked, confirm / change / cancel / done, and the day to set. A DISCOM
 * inspection or net-meter date is set here and told to the customer ("Tell DISCOM date").
 */
export function VisitCard({
  scope,
  compact = false,
}: {
  readonly scope: VisitScope;
  /** The screen already has its own day picker (a service ticket): only the status and steps. */
  readonly compact?: boolean;
}) {
  const allowed = useCan('projects.manage', 'tasks.assign', 'service.manage', 'leads.manage');
  const query = useVisits(scope, allowed);
  if (!allowed || !query.data?.kind) return null;
  return <VisitBody scope={scope} data={query.data} compact={compact} />;
}

function VisitBody({
  scope,
  data,
  compact,
}: {
  readonly scope: VisitScope;
  readonly data: VisitsOf;
  readonly compact: boolean;
}) {
  const t = useTranslations('visits');
  const format = useFormatter();
  const visit = data.visits.find((one) => OPEN.has(one.status)) ?? data.visits[0];
  const open = visit && OPEN.has(visit.status) ? visit : undefined;
  const mutations = useVisitMutations(scope);
  const ask = useSendAction(scope);
  const [day, setDay] = useState(open?.day ?? data.freeDays[0] ?? '');
  const [slot, setSlot] = useState<(typeof SLOTS)[number]>(open?.slot ?? 'morning');
  const label = (iso: string) =>
    format.dateTime(new Date(`${iso}T00:00:00Z`), { ...DAY, timeZone: 'UTC' });
  const days = data.freeDays.map((value) => ({ value, label: label(value) }));
  return (
    <section className="flex flex-col gap-3 border-t border-hairline pt-5">
      <h3 className="type-overline text-ink-faint uppercase">
        {t(`title.${data.kind ?? 'service'}`)}
      </h3>
      {visit && <VisitLine visit={visit} label={label(visit.day)} />}
      {open?.status === 'proposed' && (
        <p className="type-body-sm text-ink-muted">{t('proposedHint')}</p>
      )}
      {!compact && !data.customerMessages && (
        <p className="type-body-sm text-ink-muted">{t('noMessages')}</p>
      )}
      {!compact && (
        <div className="flex flex-wrap items-end gap-3">
          <Field label={t('day')} className="sm:max-w-44">
            {data.presence ? (
              <Input
                type="date"
                min={todayIn()}
                value={day}
                onChange={(e) => setDay(e.target.value)}
              />
            ) : (
              <Select
                value={day || undefined}
                onValueChange={setDay}
                options={withCurrent(days, day, label)}
                placeholder={t('noFreeDay')}
              />
            )}
          </Field>
          {!data.presence && (
            <Field label={t('slot')} className="sm:max-w-40">
              <Select
                value={slot}
                onValueChange={setSlot}
                options={SLOTS.map((value) => ({ value, label: t(`slots.${value}`) }))}
              />
            </Field>
          )}
          <Button
            variant="secondary"
            leadingIcon={<CalendarCheck />}
            disabled={!day}
            pending={mutations.set.isPending}
            onClick={() => mutations.set.mutate({ day, slot: data.presence ? 'morning' : slot })}
          >
            {t(setLabel(data.presence, open?.status))}
          </Button>
        </div>
      )}
      <div className="flex flex-wrap justify-end gap-2">
        {!data.presence && data.customerMessages && (
          <Button
            variant="quiet"
            pending={ask.isPending}
            onClick={() => ask.mutate({ action: 'ask_visit', ...scope })}
          >
            {t('ask')}
          </Button>
        )}
        {open?.status === 'proposed' && (
          <Button
            variant="secondary"
            leadingIcon={<Check />}
            pending={mutations.set.isPending}
            onClick={() => mutations.set.mutate({ day: open.day, slot: open.slot })}
          >
            {t('confirm')}
          </Button>
        )}
        {open?.status === 'confirmed' && (
          <Button
            variant="quiet"
            pending={mutations.done.isPending}
            onClick={() => mutations.done.mutate(open.id)}
          >
            {t('done')}
          </Button>
        )}
        {open && (
          <Button
            variant="quiet"
            leadingIcon={<X />}
            pending={mutations.cancel.isPending}
            onClick={() => mutations.cancel.mutate(open.id)}
          >
            {t('cancel')}
          </Button>
        )}
      </div>
    </section>
  );
}

const setLabel = (presence: boolean, status: Visit['status'] | undefined) =>
  presence ? 'tellDate' : status ? 'move' : 'book';

/** The free days plus the visit's own day, which may no longer be free. */
function withCurrent(
  days: readonly { value: string; label: string }[],
  current: string,
  label: (iso: string) => string,
) {
  return !current || days.some((one) => one.value === current)
    ? [...days]
    : [{ value: current, label: label(current) }, ...days];
}

function VisitLine({ visit, label }: { readonly visit: Visit; readonly label: string }) {
  const t = useTranslations('visits');
  const crew = visit.crew.map((person) => person.name).join(', ');
  const note = visit.customerCannotAt
    ? t('cannot')
    : visit.customerConfirmedAt
      ? t('customerConfirmed')
      : null;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <span className="type-body font-medium text-ink">
        {label}
        {visit.kind === 'inspection' || visit.kind === 'net_meter'
          ? ''
          : `, ${t(`slots.${visit.slot}`)}`}
      </span>
      <StatusPill size="sm" tone={TONE[visit.status]} label={t(`status.${visit.status}`)} />
      {crew && <span className="type-body-sm text-ink-faint">{crew}</span>}
      {note && <span className="type-body-sm text-ink-muted">{note}</span>}
    </div>
  );
}
