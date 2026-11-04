'use client';

import type { EscalationPolicyRecord } from '@oneohm/api-contracts';
import { Button, Card, Field, useToast } from '@oneohm/design-system/web';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { type FormEvent, useEffect, useState } from 'react';
import { FormError } from '@/components/form-error';
import { api, expectStatus } from '@/lib/api/api-client';
import { useApiForm } from '@/lib/forms/use-api-form';
import { NumberInput } from '../number-input';

const KEY = ['escalation-policy'] as const;

const FIELDS = [
  ['managerAfterDays', 'daysLate'],
  ['ownersAfterDays', 'daysLate'],
  ['stuckInternalDays', 'daysWaiting'],
  ['stuckOutsideDays', 'daysWaitingOthers'],
] as const satisfies readonly (readonly [keyof EscalationPolicyRecord, string])[];

/** How many days late or stuck before the manager, then the owner, hears (PRD 3.7). */
export function EscalationCard() {
  const t = useTranslations('projectTeam.escalation');
  const toast = useToast();
  const client = useQueryClient();
  const form = useApiForm();
  const query = useQuery({
    queryKey: KEY,
    queryFn: () => expectStatus(api.projectTeam.escalationPolicy(), 200),
  });
  const [draft, setDraft] = useState<EscalationPolicyRecord | null>(null);
  useEffect(() => {
    if (query.data) setDraft(query.data);
  }, [query.data]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!draft) return;
    await form.run(
      () => expectStatus(api.projectTeam.updateEscalationPolicy({ body: draft }), 200),
      (saved) => {
        client.setQueryData(KEY, saved);
        toast({ title: t('saved'), tone: 'success' });
      },
    );
  };

  if (!draft) return null;
  return (
    <Card>
      <form onSubmit={submit} noValidate className="flex flex-col gap-4 px-5 py-5">
        <div className="flex flex-col gap-0.5">
          <h3 className="type-title-md text-ink">{t('title')}</h3>
          <p className="type-body-sm text-ink-faint">{t('intro')}</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {FIELDS.map(([key, unit]) => (
            <Field key={key} label={t(key)} hint={t(unit)} error={form.fieldErrors[key]}>
              <NumberInput
                unit="whole"
                value={draft[key]}
                onValueChange={(value) => setDraft({ ...draft, [key]: value ?? 0 })}
              />
            </Field>
          ))}
        </div>
        <FormError message={form.error} />
        <Button type="submit" variant="secondary" pending={form.pending} className="self-start">
          {t('save')}
        </Button>
      </form>
    </Card>
  );
}
