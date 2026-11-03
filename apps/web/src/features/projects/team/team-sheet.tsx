'use client';

import type { ProjectDetail, TeamOptions } from '@oneohm/api-contracts';
import { Button, Field, Input, Select, Sheet, useToast } from '@oneohm/design-system/web';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { type FormEvent, useCallback, useEffect, useId, useRef, useState } from 'react';
import { FormError } from '@/components/form-error';
import { api, expectStatus } from '@/lib/api/api-client';
import { ApiError } from '@/lib/api/api-error';
import { useApiForm } from '@/lib/forms/use-api-form';
import { HandOverField } from './handover-field';
import { handOverBody, handOverNeeds } from './handover-needs';
import { seedTeamForm } from './seed-team-form';
import { TeamMembersField } from './team-members-field';
import { useTeamOptions } from './use-team-options';

/**
 * People who can manage, plus today's manager when they no longer qualify, marked so the
 * select still shows who holds the project.
 */
function managerChoices(
  people: TeamOptions['people'],
  current: ProjectDetail['manager'],
  inactive: string,
  cannotManage: string,
) {
  const choices = people
    .filter((person) => person.canManage)
    .map((person) => ({ value: person.id, label: person.fullName }));
  if (!current || choices.some((choice) => choice.value === current.id)) return choices;
  const listed = people.some((person) => person.id === current.id);
  return [
    { value: current.id, label: `${current.fullName} ${listed ? cannotManage : inactive}` },
    ...choices,
  ];
}

/** Change the manager (who is told), the named team or the target finish (PRD 3.6, 3.8). */
export function TeamSheet({
  project,
  open,
  onClose,
}: {
  readonly project: ProjectDetail;
  readonly open: boolean;
  readonly onClose: () => void;
}) {
  const t = useTranslations('projectTeam.sheet');
  const createT = useTranslations('projectTeam.create');
  const formId = useId();
  const toast = useToast();
  const client = useQueryClient();
  const options = useTeamOptions(open);
  const form = useApiForm();
  const { reset } = form;
  const [manager, setManager] = useState<string | undefined>(undefined);
  const [team, setTeam] = useState<string[]>([]);
  const [target, setTarget] = useState('');
  const [picks, setPicks] = useState<Record<string, string>>({});
  const seed = useCallback((from: ProjectDetail) => {
    const seeded = seedTeamForm(from);
    setManager(seeded.manager);
    setTeam(seeded.team);
    setTarget(seeded.target);
    setPicks({});
  }, []);

  // The form starts from the project as it is when the sheet opens; a refetch while the
  // person edits must not wipe what they typed.
  const latest = useRef(project);
  latest.current = project;
  useEffect(() => {
    if (!open) return;
    seed(latest.current);
    reset();
  }, [open, reset, seed]);

  const managerOptions = managerChoices(
    options.data?.people ?? [],
    project.manager,
    t('inactive'),
    t('cannotManage'),
  );

  const needs = handOverNeeds(project, team);
  const missing = needs.some((need) => !picks[need.id]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await form.run(
      async () => {
        try {
          return await expectStatus(
            api.projectTeam.updateProject({
              params: { id: project.id },
              body: {
                version: project.version,
                ...(manager ? { managerUserId: manager } : {}),
                teamUserIds: team,
                targetFinishDate: target || null,
                handOver: handOverBody(needs, picks),
              },
            }),
            200,
          );
        } catch (caught) {
          // Someone saved first: load what they saved into the form, and make the person
          // look it over before saving again.
          if (caught instanceof ApiError && caught.code === 'stale') {
            await client.invalidateQueries({ queryKey: ['project', project.id] });
            const fresh = client.getQueryData<ProjectDetail>(['project', project.id]);
            if (fresh) seed(fresh);
            throw new ApiError(409, t('reloaded'), 'stale', {});
          }
          throw caught;
        }
      },
      async (saved) => {
        client.setQueryData(['project', project.id], saved);
        await client.invalidateQueries({ queryKey: ['projects'] });
        toast({ title: t('saved'), tone: 'success' });
        onClose();
      },
    );
  };

  const errors = form.fieldErrors;
  return (
    <Sheet
      open={open}
      onOpenChange={(next) => !next && onClose()}
      title={t('title')}
      description={t('description')}
      footer={
        <Button
          type="submit"
          form={formId}
          variant="primary"
          pending={form.pending}
          disabled={missing}
        >
          {t('save')}
        </Button>
      }
    >
      <form
        id={formId}
        onSubmit={submit}
        noValidate
        className="flex flex-col gap-5 px-5 py-6 sm:px-6"
      >
        <Field label={t('manager')} hint={t('managerHint')} error={errors.managerUserId}>
          <Select value={manager} onValueChange={setManager} options={managerOptions} />
        </Field>
        <Field
          label={createT('targetFinish')}
          hint={createT('targetFinishHint')}
          error={errors.targetFinishDate}
        >
          <Input
            type="date"
            value={target}
            min={project.startDate}
            onChange={(event) => setTarget(event.target.value)}
          />
        </Field>
        <TeamMembersField
          people={options.data?.people ?? []}
          current={project.setup.team}
          value={team}
          onChange={setTeam}
          error={errors.teamUserIds}
        />
        <HandOverField
          needs={needs}
          people={options.data?.people ?? []}
          team={team}
          picks={picks}
          onPick={(from, value) => setPicks((now) => ({ ...now, [from]: value }))}
          error={errors.handOver}
        />
        <FormError message={form.error} />
      </form>
    </Sheet>
  );
}
