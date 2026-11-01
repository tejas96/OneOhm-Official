'use client';

import type { ContractorDetail } from '@oneohm/api-contracts';
import {
  Button,
  Dialog,
  Field,
  Input,
  Select,
  Textarea,
  useToast,
} from '@oneohm/design-system/web';
import { formatKwp } from '@oneohm/shared';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { type FormEvent, useId, useState } from 'react';
import { FormError } from '@/components/form-error';
import { api, expectStatus } from '@/lib/api/api-client';
import { useApiForm } from '@/lib/forms/use-api-form';
import { useRefreshContractors } from './use-contractors';

/**
 * Hands a project's open tasks in this contractor's kind of work to the crew lead; the
 * work order and its rate lines are created from the rate card.
 */
export function IssueWorkOrderDialog({
  contractor,
  open,
  onOpenChange,
}: {
  readonly contractor: ContractorDetail;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations('contractors.issue');
  const formId = useId();
  const toast = useToast();
  const router = useRouter();
  const refresh = useRefreshContractors();
  const form = useApiForm();
  const [projectId, setProjectId] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [scope, setScope] = useState('');
  const projects = useQuery({
    queryKey: ['projects', 'live-for-work-orders'],
    queryFn: () => expectStatus(api.projects.listProjects(), 200),
    enabled: open,
  });
  const live = (projects.data ?? []).filter((project) => project.status === 'active');

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const issued = await form.run(() =>
      expectStatus(
        api.contractors.issueWorkOrder({
          params: { id: contractor.id },
          body: { projectId, dueDate: dueDate || null, scope: scope.trim() || null },
        }),
        201,
      ),
    );
    if (!issued) return;
    await refresh();
    toast({
      tone: 'success',
      title: t('done', { number: issued.number }),
      reference: issued.number,
    });
    onOpenChange(false);
    router.push(`/contractors/work-orders/${issued.id}`);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('title')}
      description={t('description', { name: contractor.name })}
      footer={
        <Button
          type="submit"
          form={formId}
          variant="primary"
          pending={form.pending}
          disabled={!projectId}
        >
          {t('submit')}
        </Button>
      }
    >
      <form id={formId} onSubmit={submit} noValidate className="flex flex-col gap-4">
        {contractor.members.length === 0 && (
          <p className="type-body-sm text-at-risk">{t('noCrew')}</p>
        )}
        <Field label={t('project')} error={form.fieldErrors.projectId}>
          <Select
            value={projectId || undefined}
            onValueChange={setProjectId}
            placeholder={projects.isPending ? t('loadingProjects') : t('pickProject')}
            options={live.map((project) => ({
              value: project.id,
              label: `${project.code} · ${project.name}`,
              description: `${formatKwp(project.capacityWp)} · ${project.place}`,
            }))}
          />
        </Field>
        <Field label={t('dueDate')} hint={t('dueHint')} error={form.fieldErrors.dueDate}>
          <Input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
        </Field>
        <Field label={t('scope')} error={form.fieldErrors.scope}>
          <Textarea value={scope} rows={3} onChange={(event) => setScope(event.target.value)} />
        </Field>
        <FormError message={form.error} />
      </form>
    </Dialog>
  );
}
