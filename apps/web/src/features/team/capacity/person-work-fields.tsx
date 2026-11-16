'use client';

import type { PersonBase } from '@oneohm/api-contracts';
import { Button, Field, Input, Select, useToast } from '@oneohm/design-system/web';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { api, expectStatus } from '@/lib/api/api-client';

export type TrackingChoice = 'follow' | 'on' | 'off';

export interface WorkDraft {
  /** Digits as typed; empty means the company default. */
  readonly limit: string;
  readonly tracking: TrackingChoice;
  /** The base place as typed: "lat, lng"; empty means none. */
  readonly base: string;
  readonly baseLabel: string;
}

/** "19.0760, 72.8777" to a point; null when empty, 'invalid' when it is not two coordinates. */
export function parseBase(
  text: string,
): { latitude: number; longitude: number } | null | 'invalid' {
  if (text.trim() === '') return null;
  const parts = text.split(/[,\s]+/).filter(Boolean);
  if (parts.length !== 2) return 'invalid';
  const [latitude, longitude] = parts.map(Number) as [number, number];
  const ok =
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    Math.abs(latitude) <= 90 &&
    Math.abs(longitude) <= 180;
  return ok ? { latitude, longitude } : 'invalid';
}

export const workDraftFrom = (person: {
  readonly personalTaskLimit: number | null;
  readonly tracking: 'on' | 'off' | null;
  readonly base?: PersonBase | null | undefined;
}): WorkDraft => ({
  limit: person.personalTaskLimit === null ? '' : String(person.personalTaskLimit),
  tracking: person.tracking ?? 'follow',
  base: person.base ? `${person.base.latitude}, ${person.base.longitude}` : '',
  baseLabel: person.base?.label ?? '',
});

/** The update body: an own limit or back to the default, and the location override. */
export function workBodyFrom(draft: WorkDraft) {
  const limit = Number.parseInt(draft.limit, 10);
  return {
    openTaskLimit: draft.limit.trim() === '' || Number.isNaN(limit) ? null : limit,
    tracking: draft.tracking === 'follow' ? null : draft.tracking,
    base: (() => {
      const place = parseBase(draft.base);
      return place === null || place === 'invalid'
        ? null
        : { ...place, label: draft.baseLabel.trim() || null };
    })(),
  };
}

/**
 * One person's workload limit (PRD 3.12) and whether location is asked for at their
 * check-ins (PRD 4.3), over their roles and the company setting.
 */
export function PersonWorkFields({
  draft,
  onChange,
  companyLimit,
  errors,
  personId,
}: {
  readonly draft: WorkDraft;
  readonly onChange: (next: WorkDraft) => void;
  readonly companyLimit: number | null;
  readonly errors: Readonly<Record<string, string>>;
  readonly personId: string | null;
}) {
  const t = useTranslations('team.editSheet.work');
  const toast = useToast();
  const [asking, setAsking] = useState(false);
  const typedBase = parseBase(draft.base);
  const suggest = async () => {
    if (!personId) return;
    setAsking(true);
    try {
      const { suggestion } = await expectStatus(
        api.people.getBaseSuggestion({ params: { id: personId } }),
        200,
      );
      if (suggestion)
        onChange({
          ...draft,
          base: `${suggestion.latitude}, ${suggestion.longitude}`,
        });
      else toast({ title: t('suggestNone'), tone: 'info' });
    } catch {
      toast({ title: t('suggestFailed'), tone: 'error' });
    } finally {
      setAsking(false);
    }
  };
  return (
    <div className="grid gap-5 sm:grid-cols-2">
      <Field
        label={t('limit')}
        hint={companyLimit ? t('limitHint', { count: companyLimit }) : t('limitHintNone')}
        error={errors.openTaskLimit}
      >
        <Input
          inputMode="numeric"
          value={draft.limit}
          placeholder={companyLimit ? String(companyLimit) : t('noLimit')}
          onChange={(event) =>
            onChange({ ...draft, limit: event.target.value.replace(/[^0-9]/g, '').slice(0, 3) })
          }
        />
      </Field>
      <Field label={t('tracking')} hint={t('trackingHint')} error={errors.tracking}>
        <Select
          value={draft.tracking}
          onValueChange={(tracking) => onChange({ ...draft, tracking })}
          options={[
            { value: 'follow', label: t('follow') },
            { value: 'on', label: t('on') },
            { value: 'off', label: t('off') },
          ]}
        />
      </Field>
      <Field
        label={t('base')}
        hint={t('baseHint')}
        error={typedBase === 'invalid' ? t('baseInvalid') : errors.base}
      >
        <div className="flex flex-col gap-2">
          <Input
            value={draft.base}
            placeholder={t('basePlaceholder')}
            onChange={(event) => onChange({ ...draft, base: event.target.value })}
          />
          <Button variant="quiet" size="sm" pending={asking} onClick={suggest}>
            {t('suggest')}
          </Button>
        </div>
      </Field>
      <Field label={t('baseLabel')} hint={t('baseLabelHint')}>
        <Input
          value={draft.baseLabel}
          maxLength={120}
          onChange={(event) => onChange({ ...draft, baseLabel: event.target.value })}
        />
      </Field>
    </div>
  );
}
