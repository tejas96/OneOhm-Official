'use client';

import type { WorkingTimeRecord, WorkingTimeSaved } from '@oneohm/api-contracts';
import { Field, Input, Switch } from '@oneohm/design-system/web';
import { checkWorkingTime, visitSettingsWithDefaults } from '@oneohm/domain';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { ListSkeleton, LoadError } from '@/components/query-state';
import { api, expectStatus } from '@/lib/api/api-client';
import { SaveBar } from '../rules/save-bar';
import { useRuleSettings } from '../rules/use-rule-settings';
import { SettingsSection } from '../settings-section';
import { HolidaysSection } from './holidays-section';
import { OutsideNotice } from './outside-notice';
import { useVisitSettings, WORKING_TIME_KEY } from './use-working-time';
import { WeekDays } from './week-days';
import { sortedHolidays, toggledOff, withLunch } from './working-time-draft';
import { openingParts } from './working-time-text';

/** Settings → Working time & holidays: the one calendar every date and visit rule reads. */
export function WorkingTimePanel() {
  const t = useTranslations('settings.workingTime');
  const [outside, setOutside] = useState<WorkingTimeSaved['outside'] | null>(null);
  const visits = useVisitSettings();
  const rule = useRuleSettings<WorkingTimeRecord>(
    WORKING_TIME_KEY,
    () => expectStatus(api.businessSettings.workingTime(), 200),
    async (body) => {
      const saved = await expectStatus(api.businessSettings.saveWorkingTime({ body }), 200);
      setOutside(saved.outside);
      return saved.settings;
    },
    t('title'),
  );
  const { draft, patch, form } = rule;
  if (rule.query.isPending || visits.isPending)
    return <ListSkeleton label={t('loading')} rows={4} />;
  if (rule.query.isError)
    return <LoadError error={rule.query.error} onRetry={() => rule.query.refetch()} />;
  if (!draft) return null;

  const saved = visitSettingsWithDefaults(visits.data);
  const live = checkWorkingTime(draft, saved);
  const errors = { ...form.fieldErrors, ...live };
  const reason = Object.values(live)[0];
  const parts = openingParts(draft);
  const lunchOn = draft.lunchStart !== null || draft.lunchEnd !== null;
  const time = (field: 'dayStart' | 'dayEnd' | 'lunchStart' | 'lunchEnd', label: string) => (
    <Field label={label} error={errors[field]}>
      <Input
        type="time"
        value={draft[field] ?? ''}
        onChange={(event) => patch({ [field]: event.target.value })}
      />
    </Field>
  );

  return (
    <form onSubmit={rule.submit} noValidate className="flex max-w-5xl flex-col gap-8">
      <p className="max-w-2xl type-body text-ink-muted">{t('intro')}</p>
      {outside && <OutsideNotice outside={outside} onDismiss={() => setOutside(null)} />}
      <SettingsSection title={t('week.title')} description={t('week.description')}>
        <WeekDays
          weeklyOff={draft.weeklyOff}
          onToggle={(day) => patch({ weeklyOff: toggledOff(draft.weeklyOff, day) })}
          error={errors.weeklyOff}
        />
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          {time('dayStart', t('week.opens'))}
          {time('dayEnd', t('week.closes'))}
        </div>
        <Switch
          checked={lunchOn}
          onCheckedChange={(on) => patch(withLunch(draft, on))}
          label={t('week.lunch')}
          description={t('week.lunchHint')}
        />
        {lunchOn && (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            {time('lunchStart', t('week.lunchFrom'))}
            {time('lunchEnd', t('week.lunchTo'))}
          </div>
        )}
        <p className="rounded-md bg-sunken px-4 py-3 type-body-sm text-ink-muted">
          {parts
            ? parts.lunch
              ? t('preview.withLunch', { open: parts.open, lunch: parts.lunch })
              : t('preview.noLunch', { open: parts.open })
            : t('preview.incomplete')}
        </p>
      </SettingsSection>
      <SettingsSection title={t('holidays.title')} description={t('holidays.description')}>
        <HolidaysSection
          holidays={draft.holidays}
          onChange={(holidays) => patch({ holidays: sortedHolidays(holidays) })}
          errors={errors}
        />
      </SettingsSection>
      <SaveBar
        dirty={rule.dirty}
        pending={form.pending}
        error={form.error ?? (reason ? t('blocked', { reason }) : null)}
        blocked={reason !== undefined}
        onDiscard={rule.discard}
      />
    </form>
  );
}
