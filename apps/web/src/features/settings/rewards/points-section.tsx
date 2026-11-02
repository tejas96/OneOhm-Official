'use client';

import type { WorkforcePolicyInput } from '@oneohm/api-contracts';
import { Button, useToast } from '@oneohm/design-system/web';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { type FormEvent, useEffect, useState } from 'react';
import { FormError } from '@/components/form-error';
import { ListSkeleton, LoadError } from '@/components/query-state';
import { api, expectStatus } from '@/lib/api/api-client';
import { useApiForm } from '@/lib/forms/use-api-form';
import { SettingsSection } from '../settings-section';
import { useWorkforceSettings, WORKFORCE_SETTINGS_KEY } from '../workforce/use-workforce-settings';
import { PointsTable } from './points-table';

type Points = WorkforcePolicyInput['points'];

/**
 * Point values, saved with the rest of the workforce policy so leave and attendance
 * rules stay exactly as they are.
 */
export function PointsSection() {
  const t = useTranslations('settings.rewards');
  const settingsT = useTranslations('settings');
  const query = useWorkforceSettings();
  const queryClient = useQueryClient();
  const toast = useToast();
  const form = useApiForm();
  const [draft, setDraft] = useState<Points | null>(null);

  useEffect(() => {
    if (query.data && !draft) setDraft(query.data.policy.points);
  }, [query.data, draft]);

  const body = (
    <>
      {query.isPending && <ListSkeleton label={t('loading')} rows={4} />}
      {query.isError && <LoadError error={query.error} onRetry={() => query.refetch()} />}
    </>
  );
  if (!query.data || !draft)
    return (
      <SettingsSection title={t('points.title')} description={t('points.description')}>
        {body}
      </SettingsSection>
    );

  const saved = query.data.policy;
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved.points);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await form.run(
      () =>
        expectStatus(api.rewards.saveWorkforcePolicy({ body: { ...saved, points: draft } }), 200),
      (result) => {
        queryClient.setQueryData(WORKFORCE_SETTINGS_KEY, result);
        setDraft(result.policy.points);
        toast({ title: settingsT('saved'), reference: t('points.title'), tone: 'success' });
      },
    );
  };
  const discard = () => {
    setDraft(saved.points);
    form.reset();
  };

  return (
    <SettingsSection title={t('points.title')} description={t('points.description')}>
      <form onSubmit={submit} noValidate className="flex flex-col gap-5">
        <PointsTable points={draft} onChange={setDraft} errors={form.fieldErrors} />
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
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
    </SettingsSection>
  );
}
