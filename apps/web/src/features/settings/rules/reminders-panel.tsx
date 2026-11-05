'use client';

import type { ReminderTimingRecord } from '@oneohm/api-contracts';
import { Field, Input, Switch } from '@oneohm/design-system/web';
import { addDays, formatInr, todayIn } from '@oneohm/shared';
import { useFormatter, useTranslations } from 'next-intl';
import { ListSkeleton, LoadError } from '@/components/query-state';
import { api, expectStatus } from '@/lib/api/api-client';
import { NumberInput } from '../number-input';
import { SettingsSection } from '../settings-section';
import { SaveBar } from './save-bar';
import { RULE_KEYS, useRuleSettings } from './use-rule-settings';

type DayField = 'paymentGraceDays' | 'paymentRepeatDays' | 'followUpLeadDays' | 'subsidyChaseDays';
type TimeField = 'staffDigestTime' | 'ownerSummaryTime';

/** When reminders and summaries go out (PRD 7.2); the worker reads these on each run. */
export function RemindersPanel() {
  const t = useTranslations('settings.rules.reminders');
  const format = useFormatter();
  const rule = useRuleSettings<ReminderTimingRecord>(
    RULE_KEYS.reminders,
    () => expectStatus(api.businessSettings.reminders(), 200),
    (body) => expectStatus(api.businessSettings.saveReminders({ body }), 200),
    t('title'),
  );
  const { draft, patch, form } = rule;
  if (rule.query.isPending) return <ListSkeleton label={t('loading')} rows={4} />;
  if (rule.query.isError)
    return <LoadError error={rule.query.error} onRetry={() => rule.query.refetch()} />;
  if (!draft) return null;

  const errors = form.fieldErrors;
  const today = todayIn();
  const day = (offset: number) =>
    format.dateTime(new Date(`${addDays(today, offset)}T00:00:00`), {
      day: 'numeric',
      month: 'short',
    });
  const grace = draft.paymentGraceDays;
  const repeat = Math.max(1, draft.paymentRepeatDays);
  const days = (field: DayField, label: string, hint: string) => (
    <Field label={t(label)} hint={t(hint)} error={errors[field]}>
      <div className="sm:max-w-40">
        <NumberInput
          unit="whole"
          value={draft[field]}
          onValueChange={(value) => patch({ [field]: value ?? 0 })}
        />
      </div>
    </Field>
  );
  const time = (field: TimeField, label: string, hint: string) => (
    <Field label={t(label)} hint={t(hint)} error={errors[field]}>
      <div className="sm:max-w-40">
        <Input
          type="time"
          value={draft[field]}
          onChange={(event) => patch({ [field]: event.target.value })}
        />
      </div>
    </Field>
  );

  return (
    <form onSubmit={rule.submit} noValidate className="flex max-w-5xl flex-col gap-8">
      <p className="max-w-2xl type-body text-ink-muted">{t('intro')}</p>
      <SettingsSection title={t('payments.title')} description={t('payments.description')}>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          {days('paymentGraceDays', 'payments.grace', 'payments.graceHint')}
          {days('paymentRepeatDays', 'payments.repeat', 'payments.repeatHint')}
        </div>
        <p className="rounded-md bg-sunken px-4 py-3 type-body-sm text-ink-muted">
          {t('payments.preview', {
            due: day(0),
            first: day(grace),
            second: day(grace + repeat),
            third: day(grace + 2 * repeat),
          })}
        </p>
      </SettingsSection>
      <SettingsSection title={t('daily.title')} description={t('daily.description')}>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          {time('staffDigestTime', 'daily.staff', 'daily.staffHint')}
          {time('ownerSummaryTime', 'daily.owner', 'daily.ownerHint')}
        </div>
      </SettingsSection>
      <SettingsSection title={t('followUps.title')} description={t('followUps.description')}>
        {days('followUpLeadDays', 'followUps.lead', 'followUps.leadHint')}
        <p className="rounded-md bg-sunken px-4 py-3 type-body-sm text-ink-muted">
          {t('followUps.preview', {
            days: draft.followUpLeadDays,
            date: day(3),
            remind: day(3 - draft.followUpLeadDays),
            time: draft.staffDigestTime,
          })}
        </p>
      </SettingsSection>
      <SettingsSection title={t('subsidy.title')} description={t('subsidy.description')}>
        {days('subsidyChaseDays', 'subsidy.chase', 'subsidy.chaseHint')}
      </SettingsSection>
      <SettingsSection title={t('selfSurvey.title')} description={t('selfSurvey.description')}>
        <Switch
          checked={draft.selfSurveyOffer}
          onCheckedChange={(value) => patch({ selfSurveyOffer: value })}
          label={t('selfSurvey.offer')}
        />
        <Field
          label={t('selfSurvey.amount')}
          hint={t('selfSurvey.amountHint')}
          error={errors.selfSurveyPaise}
        >
          <div className="sm:max-w-40">
            <NumberInput
              unit="paise"
              value={draft.selfSurveyPaise}
              onValueChange={(value) => patch({ selfSurveyPaise: value ?? 0 })}
            />
          </div>
        </Field>
        <p className="rounded-md bg-sunken px-4 py-3 type-body-sm text-ink-muted">
          {draft.selfSurveyOffer
            ? t('selfSurvey.preview', { amount: formatInr(draft.selfSurveyPaise) })
            : t('selfSurvey.off')}
        </p>
      </SettingsSection>
      <SettingsSection title={t('whatsapp.title')} description={t('whatsapp.description')}>
        <Switch
          checked={draft.whatsappNightReply}
          onCheckedChange={(value) => patch({ whatsappNightReply: value })}
          label={t('whatsapp.nightReply')}
        />
        <p className="rounded-md bg-sunken px-4 py-3 type-body-sm text-ink-muted">
          {t('whatsapp.nightReplyPreview')}
        </p>
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
