'use client';

import { COMMAND_CENTER_PERIODS } from '@oneohm/api-contracts';
import { Button, Select } from '@oneohm/design-system/web';
import { PROJECT_TYPES } from '@oneohm/domain';
import { X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { usePeople } from '@/features/team/use-team';
import { type Period, type ProjectType, useCenterFilters } from './use-center-filters';

const ANY = 'any';

/**
 * Period, project manager and project type, shared by the command centre and the
 * reports. `hideManager` drops the manager choice where it does not apply.
 */
export function CenterFilterBar({ hideManager = false }: { readonly hideManager?: boolean }) {
  const t = useTranslations('commandCenter.filters');
  const { query, active, setPeriod, setManager, setType, clear } = useCenterFilters();
  const people = usePeople();
  const managers = (people.data ?? []).filter((person) =>
    person.roles.some((role) => role.kind === 'staff'),
  );
  return (
    <fieldset className="flex flex-wrap items-center gap-2 border-0 p-0">
      <legend className="sr-only">{t('label')}</legend>
      <Select<Period>
        className="w-full sm:w-52"
        label={t('label')}
        value={query.period ?? 'this_month'}
        onValueChange={setPeriod}
        options={COMMAND_CENTER_PERIODS.map((value) => ({ value, label: t(`period.${value}`) }))}
      />
      {!hideManager && (
        <Select<string>
          className="w-full sm:w-56"
          label={t('anyManager')}
          value={query.managerUserId ?? ANY}
          onValueChange={(value) => setManager(value === ANY ? null : value)}
          options={[
            { value: ANY, label: t('anyManager') },
            ...managers.map((person) => ({ value: person.id, label: person.fullName })),
          ]}
        />
      )}
      <Select<ProjectType | typeof ANY>
        className="w-full sm:w-52"
        label={t('everyType')}
        value={query.projectType ?? ANY}
        onValueChange={(value) => setType(value === ANY ? null : value)}
        options={[
          { value: ANY, label: t('everyType') },
          ...PROJECT_TYPES.map((value) => ({ value, label: t(`types.${value}`) })),
        ]}
      />
      {active > 0 && (
        <Button variant="quiet" size="sm" leadingIcon={<X />} onClick={clear}>
          {t('clear')}
        </Button>
      )}
    </fieldset>
  );
}
