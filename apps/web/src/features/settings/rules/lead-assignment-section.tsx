'use client';

import type { LeadAssignmentRulesRecord } from '@oneohm/api-contracts';
import { Button, Field, Input, SegmentedControl, Select } from '@oneohm/design-system/web';
import type { LeadAssignmentStrategy } from '@oneohm/domain';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { ListSkeleton, LoadError } from '@/components/query-state';
import { useLeadOwnerOptions } from '@/features/leads/use-lead-owners';
import { api, expectStatus } from '@/lib/api/api-client';
import { SettingsSection } from '../settings-section';
import { SaveBar } from './save-bar';
import { RULE_KEYS, useRuleSettings } from './use-rule-settings';

/**
 * Who gets a new lead nobody picked (website, WhatsApp, referral, reseller, reopen):
 * the way to choose, and optional city owners who take their cities first. The API
 * trims the city names, refuses a person with no city, and drops an owner who no longer
 * works on leads (shown here by name, marked inactive).
 */
export function LeadAssignmentSection() {
  const t = useTranslations('settings.rules.leadAssignment');
  const rule = useRuleSettings<LeadAssignmentRulesRecord>(
    RULE_KEYS.leadAssignment,
    () => expectStatus(api.businessSettings.leadAssignment(), 200),
    (body) => expectStatus(api.businessSettings.saveLeadAssignment({ body }), 200),
    t('title'),
  );
  const people = useLeadOwnerOptions(true);
  const [adding, setAdding] = useState('');
  const { draft, patch, form } = rule;
  if (rule.query.isPending) return <ListSkeleton label={t('loading')} rows={3} />;
  if (rule.query.isError)
    return <LoadError error={rule.query.error} onRetry={() => rule.query.refetch()} />;
  if (!draft) return null;

  const nameOf = (owner: (typeof draft.cityOwners)[number]) => {
    const name =
      owner.name ?? people.find((person) => person.value === owner.userId)?.label ?? t('someone');
    return owner.inactive ? t('inactive', { name }) : name;
  };
  // System-role holders are never picked as sellers, so they are not offered here.
  const free = people.filter(
    (p) => !p.system && !draft.cityOwners.some((o) => o.userId === p.value),
  );
  const setCities = (userId: string, text: string) =>
    patch({
      cityOwners: draft.cityOwners.map((o) =>
        o.userId === userId ? { ...o, cities: text.split(',') } : o,
      ),
    });
  const add = () => {
    if (!adding) return;
    patch({ cityOwners: [...draft.cityOwners, { userId: adding, cities: [''] }] });
    setAdding('');
  };

  return (
    <form onSubmit={rule.submit} noValidate className="flex max-w-5xl flex-col gap-8">
      <SettingsSection title={t('title')} description={t('help')}>
        <SegmentedControl<LeadAssignmentStrategy>
          label={t('strategy')}
          value={draft.strategy}
          onValueChange={(strategy) => patch({ strategy })}
          options={[
            { value: 'least_busy', label: t('least_busy') },
            { value: 'round_robin', label: t('round_robin') },
          ]}
          className="self-start"
        />
        <p className="rounded-md bg-sunken px-4 py-3 type-body-sm text-ink-muted">
          {t(`explain.${draft.strategy}`)}
        </p>
        <div className="flex flex-col gap-3">
          <h3 className="type-label text-ink">{t('cityOwners')}</h3>
          <p className="type-body-sm text-ink-faint">{t('cityOwnersHint')}</p>
          {draft.cityOwners.map((owner) => (
            <div key={owner.userId} className="grid items-end gap-3 sm:grid-cols-[12rem_1fr_auto]">
              <div className="flex flex-col gap-0.5">
                <p className="type-body text-ink">{nameOf(owner)}</p>
                {owner.inactive && (
                  <p className="type-body-sm text-ink-faint">{t('inactiveNote')}</p>
                )}
              </div>
              <Field label={t('cities')} error={form.fieldErrors[`cities_${owner.userId}`]}>
                <Input
                  value={owner.cities.join(',')}
                  onChange={(event) => setCities(owner.userId, event.target.value)}
                  placeholder={t('citiesPlaceholder')}
                />
              </Field>
              <Button
                variant="quiet"
                onClick={() =>
                  patch({ cityOwners: draft.cityOwners.filter((o) => o.userId !== owner.userId) })
                }
              >
                {t('remove')}
              </Button>
            </div>
          ))}
          {free.length > 0 && (
            <div className="grid items-end gap-3 sm:grid-cols-[1fr_auto]">
              <Field label={t('addPerson')}>
                <Select value={adding} onValueChange={setAdding} options={free} />
              </Field>
              <Button variant="secondary" onClick={add} disabled={!adding}>
                {t('add')}
              </Button>
            </div>
          )}
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
