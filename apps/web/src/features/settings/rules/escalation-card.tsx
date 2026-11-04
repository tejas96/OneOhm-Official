'use client';

import type { EscalationPolicyRecord } from '@oneohm/api-contracts';
import { Field, useToast } from '@oneohm/design-system/web';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { type FormEvent, useEffect, useState } from 'react';
import { api, expectStatus } from '@/lib/api/api-client';
import { useApiForm } from '@/lib/forms/use-api-form';
import { NumberInput } from '../number-input';
import { SettingsSection } from '../settings-section';
import { SaveBar } from './save-bar';

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
  const dirty = JSON.stringify(draft) !== JSON.stringify(query.data);
  return (
    <form onSubmit={submit} noValidate className="flex max-w-5xl flex-col gap-8">
      <SettingsSection title={t('title')} description={t('intro')}>
        <div className="grid gap-4 sm:grid-cols-2">
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
      </SettingsSection>
      <SaveBar
        dirty={dirty}
        pending={form.pending}
        error={form.error}
        onDiscard={() => setDraft(query.data ?? null)}
      />
    </form>
  );
}
