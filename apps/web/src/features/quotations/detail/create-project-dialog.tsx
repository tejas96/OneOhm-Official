'use client';

import type { QuotationDetail } from '@oneohm/api-contracts';
import { Button, Dialog, Field, Input, Select, Switch, useToast } from '@oneohm/design-system/web';
import { rupeesToPaise, todayIn } from '@oneohm/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { type FormEvent, useEffect, useState } from 'react';
import { AUTO_CONTRACTOR } from '@/features/projects/team/contractor-field';
import { useTeamOptions } from '@/features/projects/team/use-team-options';
import { api, expectStatus } from '@/lib/api/api-client';
import { ApiError, describeError } from '@/lib/api/api-error';
import { parseNumber } from '@/lib/forms/checks';
import { useDiscoms, useProperty } from '../builder/property-summary';
import { CreateTeamSection } from './create-team-section';
import { type LenderChoice, LoanFields, lenderFields, NO_LENDER } from './loan-fields';
import { DEFAULT_PLAN, PaymentPlanField } from './payment-plan-field';
import { ProjectFactsSummary } from './project-facts-summary';

/**
 * Accepted quotation → project (PRD 3.8, Flow A step 7): confirm the type and subsidy,
 * DISCOM, loan, options, team and contractor; the API then generates the tasks, assigns
 * them within that team and activates the payments.
 */
export function CreateProjectDialog({
  quotation,
  open,
  onOpenChange,
}: {
  readonly quotation: QuotationDetail;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations('quotations.project');
  const teamT = useTranslations('projectTeam.create');
  const checkT = useTranslations('checks');
  const toast = useToast();
  const router = useRouter();
  const queryClient = useQueryClient();
  const property = useProperty(open ? quotation.input.propertyId : null);
  const discoms = useDiscoms();
  const options = useTeamOptions(open);

  const [discomId, setDiscomId] = useState<string | undefined>(undefined);
  const [startDate, setStartDate] = useState(() => todayIn());
  const [targetFinish, setTargetFinish] = useState('');
  const [loan, setLoan] = useState(false);
  const [lender, setLender] = useState<LenderChoice>(NO_LENDER);
  const [loanRupees, setLoanRupees] = useState('');
  const [battery, setBattery] = useState(Boolean(quotation.input.batteryProductId));
  const [groundMount, setGroundMount] = useState(quotation.input.structureType === 'ground_mount');
  const [nameChange, setNameChange] = useState(false);
  const [manager, setManager] = useState<string | undefined>(undefined);
  const [contractor, setContractor] = useState<string>(AUTO_CONTRACTOR);
  const [team, setTeam] = useState<string[]>([]);
  const [plan, setPlan] = useState<string>(DEFAULT_PLAN);
  const [checks, setChecks] = useState<Record<string, string>>({});

  const site = property.data;
  useEffect(() => {
    if (!site) return;
    setDiscomId((current) => current ?? site.discomId ?? undefined);
    const holder = site.meterHolderName?.trim().toLowerCase();
    setNameChange(Boolean(holder && holder !== site.customer.name.trim().toLowerCase()));
  }, [site]);

  const create = useMutation({
    mutationFn: () =>
      expectStatus(
        api.projects.createProject({
          body: {
            quotationId: quotation.id,
            discomId: discomId ?? '',
            loan,
            ...lenderFields(loan, lender),
            loanPaise: loan && loanRupees ? rupeesToPaise(parseNumber(loanRupees) ?? 0) : 0,
            battery,
            groundMount,
            nameChange,
            managerUserId: manager ?? null,
            paymentPlanId: plan === DEFAULT_PLAN ? null : plan,
            startDate,
            targetFinishDate: targetFinish || null,
            contractorId: contractor === AUTO_CONTRACTOR ? null : contractor,
            teamUserIds: team,
          },
        }),
        201,
      ),
    onSuccess: async (project) => {
      await queryClient.invalidateQueries({ queryKey: ['quotation', quotation.id] });
      await queryClient.invalidateQueries({ queryKey: ['quotations'] });
      toast({
        tone: 'success',
        title: t('created', { code: project.code }),
        description: [
          t('createdDetail', { tasks: project.tasks, unassigned: project.unassigned }),
          project.toConfirm > 0 ? teamT('toConfirm', { count: project.toConfirm }) : '',
        ].join(' '),
      });
      onOpenChange(false);
      router.push(`/projects/${project.id}`);
    },
  });
  const errors = {
    ...(create.error instanceof ApiError ? create.error.fieldErrors : {}),
    ...checks,
  };
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (create.isPending) return;
    const found: Record<string, string> = {};
    if (!discomId) found.discomId = checkT('required');
    if (!startDate) found.startDate = checkT('required');
    if (!manager) found.managerUserId = checkT('required');
    if (loan && loanRupees) {
      const amount = parseNumber(loanRupees);
      if (amount === null || amount <= 0) found.loanPaise = checkT('positiveAmount');
    }
    setChecks(found);
    if (Object.keys(found).length > 0) return;
    create.mutate();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      title={t('title')}
      description={t('description')}
      footer={
        <>
          <Button variant="quiet" onClick={() => onOpenChange(false)}>
            {t('cancel')}
          </Button>
          <Button
            type="submit"
            form="create-project"
            variant="primary"
            pending={create.isPending}
            disabled={!discomId || !startDate || !manager}
          >
            {t('confirm')}
          </Button>
        </>
      }
    >
      <form id="create-project" onSubmit={submit} noValidate className="flex flex-col gap-5">
        <ProjectFactsSummary quotation={quotation} />
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label={t('discom')} error={errors.discomId} required>
            <Select
              value={discomId}
              onValueChange={setDiscomId}
              placeholder={t('choose')}
              options={(discoms.data ?? [])
                .filter((discom) => discom.active)
                .map((discom) => ({ value: discom.id, label: `${discom.code} · ${discom.name}` }))}
            />
          </Field>
          <Field label={t('start')} error={errors.startDate} required>
            <Input
              type="date"
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
            />
          </Field>
          <Field
            label={teamT('targetFinish')}
            hint={teamT('targetFinishHint')}
            error={errors.targetFinishDate}
          >
            <Input
              type="date"
              value={targetFinish}
              min={startDate}
              onChange={(event) => setTargetFinish(event.target.value)}
            />
          </Field>
        </div>
        <PaymentPlanField
          value={plan}
          onChange={setPlan}
          error={errors.paymentPlanId}
          enabled={open}
        />
        <CreateTeamSection
          options={options.data}
          manager={manager}
          onManager={setManager}
          contractor={contractor}
          onContractor={setContractor}
          team={team}
          onTeam={setTeam}
          errors={errors}
        />
        <div className="flex flex-col divide-y divide-hairline rounded-xl border border-hairline px-4">
          <Switch
            className="py-3"
            checked={loan}
            onCheckedChange={setLoan}
            label={t('loan')}
            description={t('loanHint')}
          />
          {loan && (
            <LoanFields
              lender={lender}
              onLender={setLender}
              loanRupees={loanRupees}
              onLoanRupees={setLoanRupees}
              errors={errors}
            />
          )}
          <Switch
            className="py-3"
            checked={battery}
            onCheckedChange={setBattery}
            label={t('battery')}
            description={t('batteryHint')}
          />
          <Switch
            className="py-3"
            checked={groundMount}
            onCheckedChange={setGroundMount}
            label={t('groundMount')}
            description={t('groundMountHint')}
          />
          <Switch
            className="py-3"
            checked={nameChange}
            onCheckedChange={setNameChange}
            label={t('nameChange')}
            description={t('nameChangeHint')}
          />
        </div>
        {create.isError && (
          <p
            role="alert"
            className="rounded-lg bg-overdue-tint px-3 py-2.5 type-body-sm text-overdue"
          >
            {describeError(create.error)}
          </p>
        )}
      </form>
    </Dialog>
  );
}
