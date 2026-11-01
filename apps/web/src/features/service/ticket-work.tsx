'use client';

import type { ServiceTicket } from '@oneohm/api-contracts';
import { Button, Field, Select, Textarea } from '@oneohm/design-system/web';
import { CircleCheck, Play } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useCan } from '@/providers/current-user';
import { useAssignees, useServiceCategories, useUpdateTicket } from './use-service-desk';

const NOBODY = 'nobody';

/** Assign, re-file, start and resolve a request. Resolving needs a note for the customer. */
export function TicketWork({ ticket }: { readonly ticket: ServiceTicket }) {
  const t = useTranslations('service');
  const canManage = useCan('service.manage');
  const assignees = useAssignees(canManage);
  const categories = useServiceCategories(canManage);
  const update = useUpdateTicket(ticket.id);
  const [note, setNote] = useState('');
  if (!canManage) return null;
  const open = ticket.status !== 'resolved';
  const people = assignees.data ?? [];
  const known = people.some((person) => person.id === ticket.assignee?.id);
  const choices = [
    { value: NOBODY, label: t('sheet.nobody') },
    ...(ticket.assignee && !known
      ? [{ value: ticket.assignee.id, label: ticket.assignee.name }]
      : []),
    ...people.map((person) => ({
      value: person.id,
      label: `${person.name} · ${t('count', { count: person.open })}`,
    })),
  ];
  const kinds = (categories.data ?? []).filter(
    (category) =>
      category.key === ticket.category ||
      (category.active && category.system === (ticket.kind === 'maintenance_visit')),
  );

  return (
    <section className="flex flex-col gap-4 border-t border-hairline pt-5">
      <h3 className="type-overline text-ink-faint uppercase">{t('sheet.work')}</h3>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label={t('sheet.assignee')}>
          <Select
            value={ticket.assignee?.id ?? NOBODY}
            onValueChange={(value) =>
              update.mutate({ assigneeUserId: value === NOBODY ? null : value })
            }
            options={choices}
            disabled={update.isPending}
          />
        </Field>
        <Field label={t('sheet.category')}>
          <Select
            value={ticket.category}
            onValueChange={(category) => update.mutate({ category })}
            options={
              kinds.length > 0
                ? kinds.map((category) => ({ value: category.key, label: category.label }))
                : [{ value: ticket.category, label: ticket.categoryLabel }]
            }
            disabled={update.isPending || ticket.kind === 'maintenance_visit'}
          />
        </Field>
      </div>
      {open && (
        <>
          <Field
            label={t('resolutionLabel')}
            hint={t('resolveBody', { name: ticket.customer.name })}
          >
            <Textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              rows={3}
              placeholder={t('sheet.notePlaceholder')}
            />
          </Field>
          <div className="flex flex-wrap justify-end gap-2">
            {ticket.status === 'open' && (
              <Button
                variant="secondary"
                leadingIcon={<Play />}
                pending={update.isPending && update.variables?.status === 'in_progress'}
                onClick={() => update.mutate({ status: 'in_progress' })}
              >
                {t('start')}
              </Button>
            )}
            <Button
              variant="primary"
              leadingIcon={<CircleCheck />}
              disabled={note.trim().length < 3}
              pending={update.isPending && update.variables?.status === 'resolved'}
              onClick={() => update.mutate({ status: 'resolved', resolutionNote: note.trim() })}
            >
              {t('resolve')}
            </Button>
          </div>
        </>
      )}
    </section>
  );
}
