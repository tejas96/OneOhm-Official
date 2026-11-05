'use client';

import type { ApprovalPolicyRecord, ApprovalPolicyView } from '@oneohm/api-contracts';
import { Badge, Button, Field } from '@oneohm/design-system/web';
import { checkApprovalPolicy } from '@oneohm/domain';
import { formatInr } from '@oneohm/shared';
import { ArrowUpRight } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { type FormEvent, useState } from 'react';
import { ListSkeleton, LoadError } from '@/components/query-state';
import { api, expectStatus } from '@/lib/api/api-client';
import { NumberInput } from '../number-input';
import { SettingsSection } from '../settings-section';
import { markBlank, withBlankErrors } from './blank-fields';
import { SaveBar } from './save-bar';
import { RULE_KEYS, useRuleSettings } from './use-rule-settings';

const LIMITS = ['bill', 'bonus'] as const;
const FIELD = { bill: 'billLimitPaise', bonus: 'bonusLimitPaise' } as const;

/** A quiet link to where a rule kept elsewhere is changed. */
function GoTo({ href, label }: { readonly href: string; readonly label: string }) {
  return (
    <Button variant="quiet" size="sm" asChild className="self-start">
      <Link href={href}>
        {label}
        <ArrowUpRight aria-hidden />
      </Link>
    </Button>
  );
}

/**
 * Every approval rule on one screen (PRD 7.2 "approval policies", 7.3): the discount
 * limit from the rate card, money limits for bills and bonuses, the fixed rule for
 * refunds and cancellations, and when a waiting approval goes up to the owner.
 */
export function ApprovalsPanel() {
  const t = useTranslations('settings.rules.approvals');
  const rule = useRuleSettings<ApprovalPolicyView>(
    RULE_KEYS.approvals,
    () => expectStatus(api.businessSettings.approvals(), 200),
    ({ discountLimitBp: _shown, ...body }) =>
      expectStatus(api.businessSettings.saveApprovals({ body }), 200),
    t('title'),
  );
  const { draft, patch, form } = rule;
  // An emptied box keeps its last value and must be filled before saving.
  const [blank, setBlank] = useState<ReadonlySet<string>>(new Set());
  const [boxes, setBoxes] = useState(0);
  const typed = (field: keyof ApprovalPolicyRecord, value: number | null) => {
    setBlank((current) => markBlank(current, field, value));
    if (value !== null) patch({ [field]: value });
  };
  if (rule.query.isPending) return <ListSkeleton label={t('loading')} rows={4} />;
  if (rule.query.isError)
    return <LoadError error={rule.query.error} onRetry={() => rule.query.refetch()} />;
  if (!draft) return null;
  // The server's own rules, shown while typing; an emptied box says so instead.
  const live = withBlankErrors(checkApprovalPolicy(draft), blank, {
    billLimitPaise: t('limitBlank'),
    bonusLimitPaise: t('limitBlank'),
    escalateAfterDays: t('waiting.daysBlank'),
    secondPersonAbovePaise: t('limitBlank'),
  });
  const blocked = Object.keys(live).length > 0;
  const errors = { ...form.fieldErrors, ...live };
  const submit = (event: FormEvent<HTMLFormElement>) => {
    if (blocked) {
      event.preventDefault();
      return;
    }
    void rule.submit(event);
  };
  const discard = () => {
    rule.discard();
    setBlank(new Set());
    setBoxes((count) => count + 1);
  };

  return (
    <form onSubmit={submit} noValidate className="flex max-w-5xl flex-col gap-8">
      <p className="max-w-2xl type-body text-ink-muted">{t('intro')}</p>
      <SettingsSection title={t('discount.title')} description={t('discount.description')}>
        <p className="type-body text-ink">
          {t('discount.rule', { percent: draft.discountLimitBp / 100 })}
        </p>
        <GoTo href="/settings?tab=rates" label={t('discount.change')} />
      </SettingsSection>
      {LIMITS.map((kind) => {
        const field: keyof ApprovalPolicyRecord = FIELD[kind];
        const limit = draft[field];
        return (
          <SettingsSection
            key={kind}
            title={t(`${kind}.title`)}
            description={t(`${kind}.description`)}
          >
            <Field label={t(`${kind}.limit`)} hint={t('limitHint')} error={errors[field]}>
              <div className="sm:max-w-56">
                <NumberInput
                  key={boxes}
                  unit="paise"
                  value={limit}
                  onValueChange={(value) => typed(field, value)}
                />
              </div>
            </Field>
            <p className="rounded-md bg-sunken px-4 py-3 type-body-sm text-ink-muted">
              {limit > 0 ? t(`${kind}.within`, { amount: formatInr(limit) }) : t(`${kind}.always`)}
            </p>
          </SettingsSection>
        );
      })}
      <SettingsSection title={t('second.title')} description={t('second.description')}>
        <Field
          label={t('second.limit')}
          hint={t('second.hint')}
          error={errors.secondPersonAbovePaise}
        >
          <div className="sm:max-w-56">
            <NumberInput
              key={boxes}
              unit="paise"
              value={draft.secondPersonAbovePaise}
              onValueChange={(value) => typed('secondPersonAbovePaise', value)}
            />
          </div>
        </Field>
        <p className="rounded-md bg-sunken px-4 py-3 type-body-sm text-ink-muted">
          {draft.secondPersonAbovePaise > 0
            ? t('second.on', { amount: formatInr(draft.secondPersonAbovePaise) })
            : t('second.off')}
        </p>
        {form.error && (
          <p role="alert" className="type-body-sm text-overdue">
            {form.error}
          </p>
        )}
      </SettingsSection>
      <SettingsSection title={t('refunds.title')} description={t('refunds.description')}>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="soft">{t('refunds.fixed')}</Badge>
          <p className="type-body text-ink">{t('refunds.rule')}</p>
        </div>
        <GoTo href="/settings?tab=roles" label={t('refunds.who')} />
      </SettingsSection>
      <SettingsSection title={t('waiting.title')} description={t('waiting.description')}>
        <Field
          label={t('waiting.days')}
          hint={t('waiting.daysHint')}
          error={errors.escalateAfterDays}
        >
          <div className="sm:max-w-40">
            <NumberInput
              key={boxes}
              unit="whole"
              value={draft.escalateAfterDays}
              onValueChange={(value) => typed('escalateAfterDays', value)}
            />
          </div>
        </Field>
        <GoTo href="/today?tab=approvals" label={t('waiting.open')} />
      </SettingsSection>
      <SaveBar
        dirty={rule.dirty || blank.size > 0}
        pending={form.pending}
        error={form.error}
        blocked={blocked}
        onDiscard={discard}
      />
    </form>
  );
}
