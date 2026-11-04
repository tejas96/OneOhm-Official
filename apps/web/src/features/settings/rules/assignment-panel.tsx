'use client';

import type { AssignmentRulesRecord } from '@oneohm/api-contracts';
import { SegmentedControl, Switch } from '@oneohm/design-system/web';
import type { AssignmentStrategy } from '@oneohm/domain';
import { useTranslations } from 'next-intl';
import { ListSkeleton, LoadError } from '@/components/query-state';
import { api, expectStatus } from '@/lib/api/api-client';
import { SettingsSection } from '../settings-section';
import { SaveBar } from './save-bar';
import { RULE_KEYS, useRuleSettings } from './use-rule-settings';

const SWITCHES = ['skipLeave', 'preferSkill', 'teamFirst'] as const;

/**
 * Settings → Task assignment (PRD 3.8, 7.2): how new project work finds a person. Tasks
 * are picked when a project is created; critical ones wait for a manager to confirm.
 * New leads have their own section (lead-assignment-section).
 */
export function AssignmentPanel() {
  const t = useTranslations('settings.rules.assignment');
  const rule = useRuleSettings<AssignmentRulesRecord>(
    RULE_KEYS.assignment,
    () => expectStatus(api.businessSettings.assignment(), 200),
    (body) => expectStatus(api.businessSettings.saveAssignment({ body }), 200),
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
      <SettingsSection title={t('who.title')} description={t('who.description')}>
        <SegmentedControl<AssignmentStrategy>
          label={t('who.title')}
          value={draft.strategy}
          onValueChange={(strategy) => patch({ strategy })}
          options={[
            { value: 'least_busy', label: t('who.least_busy') },
            { value: 'round_robin', label: t('who.round_robin') },
          ]}
          className="self-start"
        />
        <p className="rounded-md bg-sunken px-4 py-3 type-body-sm text-ink-muted">
          {t(`who.explain.${draft.strategy}`)}
        </p>
      </SettingsSection>
      <SettingsSection title={t('checks.title')} description={t('checks.description')}>
        <div className="flex flex-col gap-4">
          {SWITCHES.map((key) => (
            <Switch
              key={key}
              checked={draft[key]}
              onCheckedChange={(on) => patch({ [key]: on })}
              label={t(`checks.${key}`)}
              description={t(`checks.${key}Hint`)}
            />
          ))}
        </div>
        {form.fieldErrors.strategy && (
          <p className="type-body-sm text-overdue">{form.fieldErrors.strategy}</p>
        )}
      </SettingsSection>
      <SaveBar
        dirty={rule.dirty}
        pending={form.pending}
        error={form.error}
        onDiscard={rule.discard}
      />
    </form>
  );
}
