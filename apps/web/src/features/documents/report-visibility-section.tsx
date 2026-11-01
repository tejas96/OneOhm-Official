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

type Change = { key: ReportKey } & (
  | { customerVisible: boolean; autoGenerate?: never }
  | { autoGenerate: boolean; customerVisible?: never }
);

/**
 * Per statutory report (PRD 3.18): whether the customer can open it in their app once
 * ready, and whether it is saved to the project documents by itself when the task that
 * triggers it is done. Each switch saves at once; the team always sees every report.
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
    mutationFn: ({ key, ...body }: Change) =>
      expectStatus(api.reportSettings.updateReportSetting({ params: { key }, body }), 200),
    onSuccess: (updated, input) => {
      client.setQueryData<ReportSetting[]>(KEY, (current) =>
        current?.map((setting) => (setting.key === updated.key ? updated : setting)),
      );
      const title =
        input.autoGenerate === undefined
          ? t(updated.customerVisible ? 'shown' : 'hidden', { name: updated.name })
          : t(updated.autoGenerate ? 'autoOn' : 'autoOff', { name: updated.name });
      toast({ tone: 'success', title });
    },
    onError: (error) =>
      toast({ tone: 'error', title: t('failed'), description: describeError(error) }),
  });
  const busy = (key: ReportKey) => change.isPending && change.variables?.key === key;
  return (
    <SettingsSection title={t('title')} description={t('description')}>
      {query.isPending && <ListSkeleton label={t('loading')} rows={3} />}
      {query.isError && <LoadError error={query.error} onRetry={() => query.refetch()} />}
      {query.data && (
        <ul className="flex flex-col divide-y divide-hairline rounded-xl border border-hairline">
          {query.data.map((setting) => (
            <li key={setting.key} className="flex flex-col gap-1 px-4 py-3">
              <span className="type-body font-medium text-ink">{setting.name}</span>
              <span className="type-body-sm text-ink-faint">
                {setting.triggers.length > 0
                  ? t('trigger', { tasks: setting.triggers.join(', ') })
                  : t('noTrigger')}
              </span>
              <div className="grid gap-x-6 sm:grid-cols-2">
                <Switch
                  checked={setting.customerVisible}
                  disabled={busy(setting.key)}
                  onCheckedChange={(customerVisible) =>
                    change.mutate({ key: setting.key, customerVisible })
                  }
                  label={t('customerSees')}
                  description={t(setting.defaultVisible ? 'defaultShown' : 'defaultHidden')}
                />
                <Switch
                  checked={setting.autoGenerate}
                  disabled={busy(setting.key)}
                  onCheckedChange={(autoGenerate) =>
                    change.mutate({ key: setting.key, autoGenerate })
                  }
                  label={t('autoGenerate')}
                  description={t('autoGenerateHint')}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </SettingsSection>
  );
}
