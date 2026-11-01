'use client';

import type { ProjectDetail } from '@oneohm/api-contracts';
import { Button, Field, Input, Select, Sheet, useToast } from '@oneohm/design-system/web';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { type FormEvent, useEffect, useId, useState } from 'react';
import { FormError } from '@/components/form-error';
import { api, expectStatus } from '@/lib/api/api-client';
import { useApiForm } from '@/lib/forms/use-api-form';
import { TeamMembersField } from './team-members-field';
import { useTeamOptions } from './use-team-options';

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

  useEffect(() => {
    if (!open) return;
    setManager(project.manager?.id);
    setTeam(project.setup.team.map((member) => member.id));
    setTarget(project.setup.targetFinishDate ?? '');
    reset();
  }, [open, project, reset]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const saved = await form.run(() =>
      expectStatus(
        api.projectTeam.updateProject({
          params: { id: project.id },
          body: {
            ...(manager ? { managerUserId: manager } : {}),
            teamUserIds: team,
            targetFinishDate: target || null,
          },
        }),
        200,
      ),
    );
    if (!saved) return;
    client.setQueryData(['project', project.id], saved);
    await client.invalidateQueries({ queryKey: ['projects'] });
    toast({ title: t('saved'), tone: 'success' });
    onClose();
  };

  const errors = form.fieldErrors;
  return (
    <Sheet
      open={open}
      onOpenChange={(next) => !next && onClose()}
      title={t('title')}
      description={t('description')}
      footer={
        <Button type="submit" form={formId} variant="primary" pending={form.pending}>
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
          <Select
            value={manager}
            onValueChange={setManager}
            options={(options.data?.people ?? []).map((person) => ({
              value: person.id,
              label: person.fullName,
            }))}
          />
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
          value={team}
          onChange={setTeam}
          error={errors.teamUserIds}
        />
        <FormError message={form.error} />
      </form>
    </Sheet>
  );
}
