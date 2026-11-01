'use client';

import type { TeamOptions } from '@oneohm/api-contracts';
import { Field, Select } from '@oneohm/design-system/web';
import { useTranslations } from 'next-intl';

/** The Select needs a value; this one lets the engine pick the contractor. */
export const AUTO_CONTRACTOR = '__auto__';

/** One crew company for all installation work (PRD 3.8, Flow H); switched-off ones are left out. */
export function ContractorField({
  contractors,
  value,
  onChange,
  error,
}: {
  readonly contractors: TeamOptions['contractors'];
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly error?: string | undefined;
}) {
  const t = useTranslations('projectTeam.create');
  return (
    <Field label={t('contractor')} hint={t('contractorHint')} error={error}>
      <Select
        value={value}
        onValueChange={onChange}
        options={[
          { value: AUTO_CONTRACTOR, label: t('contractorAuto') },
          ...contractors
            .filter((contractor) => contractor.active)
            .map((contractor) => ({
              value: contractor.id,
              label: t('contractorCrew', { name: contractor.name, crew: contractor.crew }),
              ...(contractor.serviceAreas.length > 0
                ? { description: contractor.serviceAreas.join(' · ') }
                : {}),
            })),
        ]}
      />
    </Field>
  );
}
