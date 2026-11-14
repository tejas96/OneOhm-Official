'use client';

import type { VisitSettingsRecord } from '@oneohm/api-contracts';
import { Field, Input, SegmentedControl, Switch } from '@oneohm/design-system/web';
import { checkVisitSettings } from '@oneohm/domain';
import { useTranslations } from 'next-intl';
import { ListSkeleton, LoadError } from '@/components/query-state';
import { api, expectStatus } from '@/lib/api/api-client';
import { NumberInput } from '../number-input';
import { SaveBar } from '../rules/save-bar';
import { useRuleSettings } from '../rules/use-rule-settings';
import { SettingsSection } from '../settings-section';
import { useWorkingTime, VISIT_SETTINGS_KEY } from '../working-time/use-working-time';
import { SlotChips } from './slot-chips';
import { VisitsPreview } from './visits-preview';

type Whole =
  | 'visitMinutes'
  | 'visitsPerSlot'
  | 'customerNoticeHours'
  | 'daysAhead'
  | 'daysShown'
  | 'missedAfterMinutes';
type Clock = 'dayBeforeAt' | 'notConfirmedAlertAt';

/** Settings → Visits & bookings: how long a visit takes, when it starts, who may book. */
export function VisitsPanel() {
  const t = useTranslations('settings.visits');
  const work = useWorkingTime();
  const rule = useRuleSettings<VisitSettingsRecord>(
    VISIT_SETTINGS_KEY,
    () => expectStatus(api.businessSettings.visitSettings(), 200),
    (body) => expectStatus(api.businessSettings.saveVisitSettings({ body }), 200),
    t('title'),
  );
  const { draft, patch, form } = rule;
  if (rule.query.isPending || work.isPending) return <ListSkeleton label={t('loading')} rows={4} />;
  if (rule.query.isError)
    return <LoadError error={rule.query.error} onRetry={() => rule.query.refetch()} />;
  if (work.isError) return <LoadError error={work.error} onRetry={() => work.refetch()} />;
  if (!draft || !work.data) return null;

  const live = checkVisitSettings(draft, work.data);
  const errors = { ...form.fieldErrors, ...live };
  const reason = Object.values(live)[0];
  const whole = (field: Whole, hint?: string) => (
    <Field label={t(`fields.${field}`)} hint={hint} error={errors[field]}>
      <div className="sm:max-w-40">
        <NumberInput
          unit="whole"
          value={draft[field]}
          onValueChange={(value) => patch({ [field]: value ?? 0 })}
        />
      </div>
    </Field>
  );
  const remind = (field: Clock) => (
    <Field label={t(`fields.${field}`)} error={errors[`reminders.${field}`]}>
      <div className="sm:max-w-40">
        <Input
          type="time"
          value={draft.reminders[field]}
          onChange={(event) =>
            patch({ reminders: { ...draft.reminders, [field]: event.target.value } })
          }
        />
      </div>
    </Field>
  );

  return (
    <form onSubmit={rule.submit} noValidate className="flex max-w-5xl flex-col gap-8">
      <p className="max-w-2xl type-body text-ink-muted">{t('intro')}</p>
      <VisitsPreview visits={draft} work={work.data} />
      <SettingsSection title={t('times.title')} description={t('times.description')}>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          {whole('visitMinutes', t('hints.visitMinutes'))}
          {whole('visitsPerSlot', t('hints.visitsPerSlot'))}
        </div>
        <SlotChips
          starts={draft.slotStarts}
          onChange={(slotStarts) => patch({ slotStarts })}
          errors={errors}
        />
      </SettingsSection>
      <SettingsSection title={t('booking.title')} description={t('booking.description')}>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          {whole('customerNoticeHours', t('hints.customerNoticeHours'))}
          {whole('daysAhead')}
          {whole('daysShown', t('hints.daysShown'))}
        </div>
        <Switch
          checked={draft.staffMayBookToday}
          onCheckedChange={(staffMayBookToday) => patch({ staffMayBookToday })}
          label={t('fields.staffMayBookToday')}
          description={t('hints.staffMayBookToday')}
        />
        <Switch
          checked={draft.autoConfirmCustomerPicks}
          onCheckedChange={(autoConfirmCustomerPicks) => patch({ autoConfirmCustomerPicks })}
          label={t('fields.autoConfirmCustomerPicks')}
          description={t('hints.autoConfirmCustomerPicks')}
        />
      </SettingsSection>
      <SettingsSection title={t('reminders.title')} description={t('reminders.description')}>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          {remind('dayBeforeAt')}
          <Field
            label={t('fields.hoursBefore')}
            hint={t('hints.hoursBefore')}
            error={errors['reminders.hoursBefore']}
          >
            <div className="sm:max-w-40">
              <NumberInput
                unit="whole"
                value={draft.reminders.hoursBefore}
                onValueChange={(value) =>
                  patch({ reminders: { ...draft.reminders, hoursBefore: value ?? 0 } })
                }
              />
            </div>
          </Field>
          {remind('notConfirmedAlertAt')}
          {whole('missedAfterMinutes', t('hints.missedAfterMinutes'))}
        </div>
      </SettingsSection>
      <SettingsSection title={t('lead.title')} description={t('lead.description')}>
        <SegmentedControl
          label={t('lead.title')}
          value={draft.leadSurveyVisitor}
          onValueChange={(leadSurveyVisitor) => patch({ leadSurveyVisitor })}
          options={[
            { value: 'owner', label: t('lead.owner') },
            { value: 'owner_then_team', label: t('lead.ownerThenTeam') },
          ]}
        />
        {errors.leadSurveyVisitor && (
          <p role="alert" className="type-body-sm text-overdue">
            {errors.leadSurveyVisitor}
          </p>
        )}
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
