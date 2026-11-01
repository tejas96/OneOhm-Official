'use client';

import type { ServiceTicket } from '@oneohm/api-contracts';
import { Button, Field, Input, useToast } from '@oneohm/design-system/web';
import { todayIn } from '@oneohm/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CalendarCheck } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { useState } from 'react';
import { api, expectStatus } from '@/lib/api/api-client';
import { describeError } from '@/lib/api/api-error';
import { useCan } from '@/providers/current-user';
import { SERVICE_KEY } from './use-service-desk';

const DAY = { weekday: 'short', day: 'numeric', month: 'short' } as const;

/** Saves the visit day (or clears it) and refreshes the desk. */
function useSaveVisitDay(id: string, onSaved: (visitOn: string | null) => void) {
  const t = useTranslations('service.visitDay');
  const format = useFormatter();
  const toast = useToast();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (visitOn: string | null) =>
      expectStatus(api.serviceDesk.setTicketVisitDay({ params: { id }, body: { visitOn } }), 200),
    onSuccess: async (ticket) => {
      await queryClient.invalidateQueries({ queryKey: SERVICE_KEY });
      onSaved(ticket.visitOn);
      toast({
        tone: 'success',
        title: ticket.visitOn
          ? t('saved', { date: format.dateTime(new Date(ticket.visitOn), DAY) })
          : t('cleared'),
      });
    },
    onError: (error) =>
      toast({ tone: 'error', title: t('failed'), description: describeError(error) }),
  });
}

/**
 * Book the technician's visit to a customer's request, move it or clear it (PRD 5.5).
 * A new day tells the customer on WhatsApp (or SMS) and in their app.
 */
export function TicketVisitDay({ ticket }: { readonly ticket: ServiceTicket }) {
  const t = useTranslations('service.visitDay');
  const canManage = useCan('service.manage');
  const [day, setDay] = useState(ticket.visitOn ?? '');
  const save = useSaveVisitDay(ticket.id, (visitOn) => setDay(visitOn ?? ''));
  if (!canManage || ticket.kind !== 'request' || ticket.status === 'resolved') return null;
  const changed = (day || null) !== ticket.visitOn;
  const first = ticket.customer.name.split(' ')[0] ?? ticket.customer.name;
  return (
    <section className="flex flex-col gap-3 border-t border-hairline pt-5">
      <h3 className="type-overline text-ink-faint uppercase">{t('title')}</h3>
      <Field label={t('label')} hint={t('hint', { name: first })} className="sm:max-w-xs">
        <Input
          type="date"
          min={todayIn()}
          value={day}
          onChange={(event) => setDay(event.target.value)}
        />
      </Field>
      <div className="flex flex-wrap justify-end gap-2">
        {ticket.visitOn && (
          <Button
            variant="quiet"
            pending={save.isPending && save.variables === null}
            onClick={() => save.mutate(null)}
          >
            {t('clear')}
          </Button>
        )}
        <Button
          variant="secondary"
          leadingIcon={<CalendarCheck />}
          disabled={!day || !changed}
          pending={save.isPending && save.variables !== null}
          onClick={() => save.mutate(day)}
        >
          {ticket.visitOn ? t('move') : t('book')}
        </Button>
      </div>
    </section>
  );
}
