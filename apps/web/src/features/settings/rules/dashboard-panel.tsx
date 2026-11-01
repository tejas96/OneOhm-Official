'use client';

import type { DashboardSettingsRecord } from '@oneohm/api-contracts';
import { Field } from '@oneohm/design-system/web';
import { useTranslations } from 'next-intl';
import { ListSkeleton, LoadError } from '@/components/query-state';
import { api, expectStatus } from '@/lib/api/api-client';
import { NumberInput } from '../number-input';
import { SettingsSection } from '../settings-section';
import { SaveBar } from './save-bar';
import { RULE_KEYS, useRuleSettings } from './use-rule-settings';

type Key = keyof DashboardSettingsRecord;

const GROUPS: readonly { readonly key: string; readonly fields: readonly Key[] }[] = [
  { key: 'late', fields: ['riskLateDays', 'paymentLateDays', 'discomWaitDays'] },
  { key: 'ahead', fields: ['dueSoonDays', 'materialLookAheadDays'] },
  { key: 'lists', fields: ['actionsShown', 'risksShown', 'deadlinesShown'] },
];

/** What the command centre counts as late or soon, and how long its lists are (PRD 7.2). */
export function DashboardPanel() {
  const t = useTranslations('settings.rules.dashboard');
  const rule = useRuleSettings<DashboardSettingsRecord>(
    RULE_KEYS.dashboard,
    () => expectStatus(api.businessSettings.dashboard(), 200),
    (body) => expectStatus(api.businessSettings.saveDashboard({ body }), 200),
    t('title'),
  );
  const { draft, patch, form } = rule;
  if (rule.query.isPending) return <ListSkeleton label={t('loading')} rows={4} />;
  if (rule.query.isError)
    return <LoadError error={rule.query.error} onRetry={() => rule.query.refetch()} />;
  if (!draft) return null;

  return (
    <form onSubmit={rule.submit} noValidate className="flex max-w-5xl flex-col gap-8">
      <p className="max-w-2xl type-body text-ink-muted">{t('intro')}</p>
      {GROUPS.map((group) => (
        <SettingsSection
          key={group.key}
          title={t(`${group.key}.title`)}
          description={t(`${group.key}.description`)}
        >
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {group.fields.map((field) => (
              <Field
                key={field}
                label={t(`fields.${field}`)}
                hint={t(`fields.${field}Hint`, { count: draft[field] })}
                error={form.fieldErrors[field]}
              >
                <NumberInput
                  unit="whole"
                  value={draft[field]}
                  onValueChange={(value) => patch({ [field]: value ?? 0 })}
                />
              </Field>
            ))}
          </div>
        </SettingsSection>
      ))}
      <SaveBar
        dirty={rule.dirty}
        pending={form.pending}
        error={form.error}
        onDiscard={rule.discard}
      />
    </form>
  );
}
