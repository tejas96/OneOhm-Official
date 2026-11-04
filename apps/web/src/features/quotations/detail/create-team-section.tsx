'use client';

import type { TeamOptions } from '@oneohm/api-contracts';
import { Field, Select } from '@oneohm/design-system/web';
import { useTranslations } from 'next-intl';
import { ContractorField } from '@/features/projects/team/contractor-field';
import { TeamMembersField } from '@/features/projects/team/team-members-field';

/** Manager, contractor and named team for a new project (PRD 3.8, Flow H). */
export function CreateTeamSection({
  options,
  manager,
  onManager,
  contractor,
  onContractor,
  team,
  onTeam,
  errors,
}: {
  readonly options: TeamOptions | undefined;
  readonly manager: string | undefined;
  readonly onManager: (value: string) => void;
  readonly contractor: string;
  readonly onContractor: (value: string) => void;
  readonly team: readonly string[];
  readonly onTeam: (value: string[]) => void;
  readonly errors: Readonly<Record<string, string>>;
}) {
  const t = useTranslations('quotations.project');
  const teamT = useTranslations('projectTeam.create');
  const people = options?.people ?? [];
  return (
    <section className="flex flex-col gap-4 rounded-xl border border-hairline p-4">
      <div className="flex flex-col gap-0.5">
        <h3 className="type-title-md text-ink">{teamT('teamTitle')}</h3>
        <p className="type-body-sm text-ink-faint">{teamT('teamHint')}</p>
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label={t('manager')} hint={t('managerHint')} error={errors.managerUserId} required>
          <Select
            value={manager}
            onValueChange={onManager}
            placeholder={t('choose')}
            options={people.map((person) => ({ value: person.id, label: person.fullName }))}
          />
        </Field>
        <ContractorField
          contractors={options?.contractors ?? []}
          value={contractor}
          onChange={onContractor}
          error={errors.contractorId}
        />
      </div>
      <TeamMembersField people={people} value={team} onChange={onTeam} error={errors.teamUserIds} />
    </section>
  );
}
