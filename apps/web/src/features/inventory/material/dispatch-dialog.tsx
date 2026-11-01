'use client';

import type { ProjectMaterial } from '@oneohm/api-contracts';
import {
  Button,
  Dialog,
  Field,
  Input,
  Select,
  Textarea,
  useToast,
} from '@oneohm/design-system/web';
import { todayIn } from '@oneohm/shared';
import { useTranslations } from 'next-intl';
import { type FormEvent, useEffect, useId, useState } from 'react';
import { FormError } from '@/components/form-error';
import { api, expectStatus } from '@/lib/api/api-client';
import { useApiForm } from '@/lib/forms/use-api-form';
import { useRefreshInventory } from '../use-inventory';
import { useProjectCustody } from './use-custody';

const NOBODY = 'none';

/** Everything reserved for the project leaves the store on one delivery challan. */
export function DispatchDialog({
  material,
  onClose,
}: {
  readonly material: ProjectMaterial | null;
  readonly onClose: () => void;
}) {
  const t = useTranslations('inventory.dispatchForm');
  const formId = useId();
  const toast = useToast();
  const refresh = useRefreshInventory();
  const form = useApiForm();
  const [dispatchedOn, setDispatchedOn] = useState(todayIn());
  const [vehicle, setVehicle] = useState('');
  const [driverName, setDriverName] = useState('');
  const [driverPhone, setDriverPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [contractorId, setContractorId] = useState(NOBODY);
  const custody = useProjectCustody(material?.projectId ?? null);
  const crews = custody.data?.contractors ?? [];
  const { reset } = form;

  useEffect(() => {
    if (!material) return;
    setDispatchedOn(todayIn());
    setVehicle('');
    setDriverName('');
    setDriverPhone('');
    setNotes('');
    reset();
  }, [material, reset]);
  // One crew on the project: they are the ones taking it at site.
  const onlyCrew = custody.data?.contractors.length === 1 ? custody.data.contractors[0]?.id : null;
  useEffect(() => {
    if (material) setContractorId(onlyCrew ?? NOBODY);
  }, [material, onlyCrew]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!material) return;
    const saved = await form.run(() =>
      expectStatus(
        api.inventory.material.dispatch({
          params: { id: material.projectId },
          body: {
            dispatchedOn,
            vehicle,
            driverName,
            driverPhone,
            notes,
            contractorId: contractorId === NOBODY ? null : contractorId,
          },
        }),
        201,
      ),
    );
    if (!saved) return;
    await refresh(material.projectId);
    toast({ tone: 'success', title: t('saved', { number: saved.dispatches[0]?.number ?? '' }) });
    onClose();
  };

  const errors = form.fieldErrors;
  return (
    <Dialog
      open={material !== null}
      onOpenChange={(next) => !next && onClose()}
      title={t('title')}
      description={material ? t('description', { project: material.projectCode }) : undefined}
      autoFocusField
      footer={
        <Button type="submit" form={formId} variant="primary" pending={form.pending}>
          {t('save')}
        </Button>
      }
    >
      <form id={formId} onSubmit={submit} noValidate className="flex flex-col gap-5">
        <FormError message={form.error} />
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label={t('vehicle')} error={errors.vehicle}>
            <Input
              value={vehicle}
              onChange={(event) => setVehicle(event.target.value)}
              className="font-mono uppercase"
            />
          </Field>
          <Field label={t('date')} error={errors.dispatchedOn} required>
            <Input
              type="date"
              value={dispatchedOn}
              onChange={(event) => setDispatchedOn(event.target.value)}
            />
          </Field>
          <Field label={t('driverName')} error={errors.driverName}>
            <Input value={driverName} onChange={(event) => setDriverName(event.target.value)} />
          </Field>
          <Field label={t('driverPhone')} error={errors.driverPhone}>
            <Input
              inputMode="tel"
              value={driverPhone}
              onChange={(event) => setDriverPhone(event.target.value)}
            />
          </Field>
        </div>
        {crews.length > 0 && (
          <Field label={t('contractor')} hint={t('contractorHint')} error={errors.contractorId}>
            <Select
              value={contractorId}
              onValueChange={setContractorId}
              options={[
                { value: NOBODY, label: t('noContractor') },
                ...crews.map((crew) => ({ value: crew.id, label: crew.name })),
              ]}
            />
          </Field>
        )}
        <Field label={t('notes')} error={errors.notes}>
          <Textarea rows={2} value={notes} onChange={(event) => setNotes(event.target.value)} />
        </Field>
      </form>
    </Dialog>
  );
}
