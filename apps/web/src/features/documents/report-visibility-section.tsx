'use client';

import type { ReportKey, ReportSetting } from '@oneohm/api-contracts';
import { Switch, useToast } from '@oneohm/design-system/web';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { ListSkeleton, LoadError } from '@/components/query-state';
import { SettingsSection } from '@/features/settings/settings-section';
import { api, expectStatus } from '@/lib/api/api-client';
import { describeError } from '@/lib/api/api-error';

const KEY = ['report-settings'] as const;

/**
 * Which statutory reports the customer can open in their app once they are ready
 * (PRD 3.18). Each switch saves at once; reports stay available to the team either way.
 */
export function ReportVisibilitySection() {
  const t = useTranslations('documents.reportVisibility');
  const toast = useToast();
  const client = useQueryClient();
  const query = useQuery({
    queryKey: KEY,
    queryFn: () => expectStatus(api.reportSettings.listReportSettings(), 200),
  });
  const change = useMutation({
    mutationFn: (input: { key: ReportKey; customerVisible: boolean }) =>
      expectStatus(
        api.reportSettings.updateReportSetting({
          params: { key: input.key },
          body: { customerVisible: input.customerVisible },
        }),
        200,
      ),
    onSuccess: (updated) => {
      client.setQueryData<ReportSetting[]>(KEY, (current) =>
        current?.map((setting) => (setting.key === updated.key ? updated : setting)),
      );
      toast({
        tone: 'success',
        title: t(updated.customerVisible ? 'shown' : 'hidden', { name: updated.name }),
      });
    },
    onError: (error) =>
      toast({ tone: 'error', title: t('failed'), description: describeError(error) }),
  });
  return (
    <SettingsSection title={t('title')} description={t('description')}>
      {query.isPending && <ListSkeleton label={t('loading')} rows={3} />}
      {query.isError && <LoadError error={query.error} onRetry={() => query.refetch()} />}
      {query.data && (
        <ul className="flex flex-col divide-y divide-hairline rounded-xl border border-hairline px-4">
          {query.data.map((setting) => (
            <li key={setting.key} className="py-1">
              <Switch
                checked={setting.customerVisible}
                disabled={change.isPending && change.variables?.key === setting.key}
                onCheckedChange={(customerVisible) =>
                  change.mutate({ key: setting.key, customerVisible })
                }
                label={setting.name}
                description={t(setting.defaultVisible ? 'defaultShown' : 'defaultHidden')}
              />
            </li>
          ))}
        </ul>
      )}
    </SettingsSection>
  );
}
