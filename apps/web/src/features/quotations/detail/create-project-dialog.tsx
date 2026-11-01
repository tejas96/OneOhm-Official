'use client';

import type { QuotationDetail } from '@oneohm/api-contracts';
import { Button, Dialog, Field, Input, Select, Switch, useToast } from '@oneohm/design-system/web';
import { rupeesToPaise, todayIn } from '@oneohm/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { type FormEvent, useEffect, useState } from 'react';
import { api, expectStatus } from '@/lib/api/api-client';
import { ApiError, describeError } from '@/lib/api/api-error';
import { useCan } from '@/providers/current-user';
import { useDiscoms, useProperty } from '../builder/property-summary';
import { DEFAULT_PLAN, PaymentPlanField } from './payment-plan-field';

const LATER = 'later';

/**
 * Accepted quotation → project (PRD 8 step 7): confirm the DISCOM, loan and options; the
 * API then generates the project's tasks, assigns the team and activates the payments.
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
  const toast = useToast();
  const router = useRouter();
  const queryClient = useQueryClient();
  const canSeePeople = useCan('people.view');
  const property = useProperty(open ? quotation.input.propertyId : null);
  const discoms = useDiscoms();
  const people = useQuery({
    queryKey: ['people'],
    queryFn: () => expectStatus(api.people.listPeople(), 200),
    enabled: open && canSeePeople,
  });

  const [discomId, setDiscomId] = useState<string | undefined>(undefined);
  const [startDate, setStartDate] = useState(() => todayIn());
  const [loan, setLoan] = useState(false);
  const [lender, setLender] = useState('');
  const [loanRupees, setLoanRupees] = useState('');
  const [battery, setBattery] = useState(Boolean(quotation.input.batteryProductId));
  const [groundMount, setGroundMount] = useState(quotation.input.structureType === 'ground_mount');
  const [nameChange, setNameChange] = useState(false);
  const [manager, setManager] = useState<string>(LATER);
  const [plan, setPlan] = useState<string>(DEFAULT_PLAN);

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
            lenderName: loan ? lender.trim() || null : null,
            loanPaise: loan && loanRupees ? rupeesToPaise(Number(loanRupees)) : 0,
            battery,
            groundMount,
            nameChange,
            managerUserId: manager === LATER ? null : manager,
            paymentPlanId: plan === DEFAULT_PLAN ? null : plan,
            startDate,
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
        description: t('createdDetail', { tasks: project.tasks, unassigned: project.unassigned }),
      });
      onOpenChange(false);
      router.push(`/projects/${project.id}`);
    },
  });
  const errors = create.error instanceof ApiError ? create.error.fieldErrors : {};
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
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
            disabled={!discomId || !startDate}
          >
            {t('confirm')}
          </Button>
        </>
      }
    >
      <form id="create-project" onSubmit={submit} className="flex flex-col gap-5">
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
        </div>
        <PaymentPlanField
          value={plan}
          onChange={setPlan}
          error={errors.paymentPlanId}
          enabled={open}
        />
        {canSeePeople && (
          <Field label={t('manager')} hint={t('managerHint')} error={errors.managerUserId}>
            <Select
              value={manager}
              onValueChange={setManager}
              options={[
                { value: LATER, label: t('managerLater') },
                ...(people.data ?? [])
                  .filter((person) => person.status === 'active')
                  .map((person) => ({ value: person.id, label: person.fullName })),
              ]}
            />
          </Field>
        )}
        <div className="flex flex-col divide-y divide-hairline rounded-xl border border-hairline px-4">
          <Switch
            className="py-3"
            checked={loan}
            onCheckedChange={setLoan}
            label={t('loan')}
            description={t('loanHint')}
          />
          {loan && (
            <div className="grid gap-4 py-4 sm:grid-cols-2">
              <Field label={t('lender')} error={errors.lenderName}>
                <Input
                  value={lender}
                  maxLength={120}
                  onChange={(event) => setLender(event.target.value)}
                />
              </Field>
              <Field label={t('loanAmount')} hint={t('loanAmountHint')} error={errors.loanPaise}>
                <Input
                  inputMode="decimal"
                  value={loanRupees}
                  onChange={(event) => setLoanRupees(event.target.value.replace(/[^\d.]/g, ''))}
                  leading={<span className="type-body text-ink-faint">₹</span>}
                  className="font-mono"
                />
              </Field>
            </div>
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
        {create.isError &&
          !(create.error instanceof ApiError && Object.keys(errors).length > 0) && (
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
