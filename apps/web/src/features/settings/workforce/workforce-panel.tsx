'use client';

import type { WorkforcePolicyInput } from '@oneohm/api-contracts';
import { Button, useToast } from '@oneohm/design-system/web';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { type FormEvent, useEffect, useState } from 'react';
import { FormError } from '@/components/form-error';
import { ListSkeleton, LoadError } from '@/components/query-state';
import { SiteTravelSection } from '@/features/site-activity/settings/site-travel-section';
import { api, expectStatus } from '@/lib/api/api-client';
import { useApiForm } from '@/lib/forms/use-api-form';
import { LeaveKindsSection } from './leave-kinds-section';
import { LocationSection } from './location-section';
import { PlacesSection } from './places-section';
import { SkillsSection } from './skills-section';
import { useWorkforceSettings, WORKFORCE_SETTINGS_KEY } from './use-workforce-settings';
import { WorkingDaySection } from './working-day-section';
import { WorkloadSection } from './workload-section';

/**
 * Leave kinds, the working week, location at check-in, site check-ins and travel, and
 * authorised places. Point values live in Settings → Rewards.
 */
export function WorkforcePanel() {
  const t = useTranslations('settings.workforce');
  const settingsT = useTranslations('settings');
  const query = useWorkforceSettings();
  const queryClient = useQueryClient();
  const toast = useToast();
  const form = useApiForm();
  const [draft, setDraft] = useState<WorkforcePolicyInput | null>(null);

  useEffect(() => {
    if (query.data && !draft) setDraft(query.data.policy);
  }, [query.data, draft]);

  if (query.isPending) return <ListSkeleton label={t('loading')} rows={4} />;
  if (query.isError) return <LoadError error={query.error} onRetry={() => query.refetch()} />;
  if (!draft) return null;

  const saved = query.data.policy;
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await form.run(
      () => expectStatus(api.rewards.saveWorkforcePolicy({ body: draft }), 200),
      (result) => {
        queryClient.setQueryData(WORKFORCE_SETTINGS_KEY, result);
        setDraft(result.policy);
        toast({ title: settingsT('saved'), reference: t('title'), tone: 'success' });
      },
    );
  };
  const discard = () => {
    setDraft(saved);
    form.reset();
  };

  return (
    <div className="flex max-w-5xl flex-col gap-8">
      <form onSubmit={submit} noValidate className="flex flex-col gap-8">
        <p className="max-w-2xl type-body text-ink-muted">{t('intro')}</p>
        <LeaveKindsSection
          kinds={draft.leaveTypes}
          savedKeys={saved.leaveTypes.map((kind) => kind.key)}
          onChange={(leaveTypes) => setDraft({ ...draft, leaveTypes })}
          errors={form.fieldErrors}
        />
        <WorkingDaySection
          weeklyOff={draft.weeklyOff}
          attendance={draft.attendance}
          onChange={(patch) => setDraft({ ...draft, ...patch })}
          errors={form.fieldErrors}
        />
        <LocationSection
          attendance={draft.attendance}
          onChange={(attendance) => setDraft({ ...draft, attendance })}
          errors={form.fieldErrors}
        />
        <SiteTravelSection
          travel={draft.travel}
          onChange={(travel) => setDraft({ ...draft, travel })}
          errors={form.fieldErrors}
        />
        <WorkloadSection
          capacity={draft.capacity}
          onChange={(capacity) => setDraft({ ...draft, capacity })}
          errors={form.fieldErrors}
        />
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
      <PlacesSection locations={query.data.locations} />
      <SkillsSection />
    </div>
  );
}
