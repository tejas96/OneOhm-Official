'use client';

import type { ReferralProgram, ReferralProgramInput } from '@oneohm/api-contracts';
import { Button, useToast } from '@oneohm/design-system/web';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { type FormEvent, useEffect, useState } from 'react';
import { FormError } from '@/components/form-error';
import { ListSkeleton, LoadError } from '@/components/query-state';
import { api, expectStatus } from '@/lib/api/api-client';
import { useApiForm } from '@/lib/forms/use-api-form';
import { CampaignSection } from './campaign-section';
import { EligibilitySection } from './eligibility-section';
import { RewardSection } from './reward-section';
import { REFERRAL_PROGRAM_KEY, useReferralProgram } from './use-referral-program';

function inputOf(program: ReferralProgram): ReferralProgramInput {
  return {
    active: program.active,
    basis: program.basis,
    amountPaise: program.amountPaise,
    qualifyingEvent: program.qualifyingEvent,
    startsOn: program.startsOn,
    budgetPaise: program.budgetPaise,
    perCustomerCount: program.perCustomerCount,
    perCustomerPaise: program.perCustomerPaise,
    eligibleTypes: program.eligibleTypes,
    shareNumber: program.shareNumber,
  };
}

/** Refer and earn (PRD 5.6): the reward, when it is earned, the budget and who qualifies. */
export function ReferralsPanel() {
  const t = useTranslations('settings.referrals');
  const settingsT = useTranslations('settings');
  const query = useReferralProgram();
  const queryClient = useQueryClient();
  const toast = useToast();
  const form = useApiForm();
  const [draft, setDraft] = useState<ReferralProgramInput | null>(null);

  useEffect(() => {
    if (query.data && !draft) setDraft(inputOf(query.data));
  }, [query.data, draft]);

  if (query.isPending) return <ListSkeleton label={t('loading')} rows={4} />;
  if (query.isError) return <LoadError error={query.error} onRetry={() => query.refetch()} />;
  if (!draft) return null;

  const saved = query.data;
  const dirty = JSON.stringify(draft) !== JSON.stringify(inputOf(saved));
  const patch = (next: Partial<ReferralProgramInput>) => setDraft({ ...draft, ...next });
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const result = await form.run(() =>
      expectStatus(api.referrals.saveProgram({ body: draft }), 200),
    );
    if (!result) return;
    queryClient.setQueryData(REFERRAL_PROGRAM_KEY, result);
    await queryClient.invalidateQueries({ queryKey: ['finance', 'payouts'] });
    setDraft(inputOf(result));
    toast({ title: settingsT('saved'), reference: t('title'), tone: 'success' });
  };
  const discard = () => {
    setDraft(inputOf(saved));
    form.reset();
  };

  return (
    <form onSubmit={submit} noValidate className="flex max-w-5xl flex-col gap-8">
      <p className="max-w-2xl type-body text-ink-muted">{t('intro')}</p>
      <RewardSection draft={draft} onChange={patch} errors={form.fieldErrors} />
      <CampaignSection draft={draft} saved={saved} onChange={patch} errors={form.fieldErrors} />
      <EligibilitySection draft={draft} saved={saved} onChange={patch} errors={form.fieldErrors} />
      <div className="flex flex-col gap-3 border-t border-hairline pt-6 sm:flex-row sm:items-center sm:justify-end">
        <FormError message={form.error} />
        {dirty && <p className="type-body-sm text-ink-faint sm:mr-auto">{t('unsaved')}</p>}
        {dirty && (
          <Button variant="quiet" onClick={discard}>
            {t('discard')}
          </Button>
        )}
        <Button type="submit" variant="primary" pending={form.pending} disabled={!dirty}>
          {settingsT('save')}
        </Button>
      </div>
    </form>
  );
}
