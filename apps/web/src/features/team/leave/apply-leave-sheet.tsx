'use client';

import type { LeaveBalance } from '@oneohm/api-contracts';
import {
  Button,
  Field,
  Input,
  Select,
  Sheet,
  Switch,
  Textarea,
  useToast,
} from '@oneohm/design-system/web';
import { todayIn } from '@oneohm/shared';
import { useTranslations } from 'next-intl';
import { type FormEvent, useEffect, useId, useMemo, useState } from 'react';
import { FormError } from '@/components/form-error';
import { api, expectStatus } from '@/lib/api/api-client';
import { useApiForm } from '@/lib/forms/use-api-form';
import { LeaveCoverFields, NO_BACKUP } from './leave-cover-fields';
import { LeaveImpactPanel } from './leave-impact-panel';
import { type LeaveWindow, useLeaveImpact, useRefreshLeave } from './use-leave';

const blank = (leaveType: string) => ({
  leaveType,
  fromDate: '',
  toDate: '',
  halfDay: false,
  reason: '',
  emergency: false,
  backupUserId: NO_BACKUP,
  handoverNote: '',
});

/** Ask for time off: pick the days, see what they cost and touch, choose who covers. */
export function ApplyLeaveSheet({
  open,
  onOpenChange,
  kinds,
}: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly kinds: readonly LeaveBalance[];
}) {
  const t = useTranslations('team.leave.apply');
  const formId = useId();
  const toast = useToast();
  const refresh = useRefreshLeave();
  const form = useApiForm();
  const firstKind = kinds[0]?.leaveType ?? '';
  const [draft, setDraft] = useState(() => blank(firstKind));
  const set = (patch: Partial<typeof draft>) => setDraft((current) => ({ ...current, ...patch }));
  const { reset } = form;

  useEffect(() => {
    if (!open) return;
    setDraft(blank(firstKind));
    reset();
  }, [open, firstKind, reset]);

  const lastDay = draft.toDate || draft.fromDate;
  const singleDay = draft.fromDate !== '' && lastDay === draft.fromDate;
  const leaveWindow = useMemo<LeaveWindow | null>(() => {
    if (!draft.leaveType || !draft.fromDate || lastDay < draft.fromDate) return null;
    return {
      leaveType: draft.leaveType,
      fromDate: draft.fromDate,
      toDate: lastDay,
      halfDay: singleDay && draft.halfDay,
    };
  }, [draft.leaveType, draft.fromDate, lastDay, singleDay, draft.halfDay]);
  const impact = useLeaveImpact(open ? leaveWindow : null);
  const kindLabel = kinds.find((kind) => kind.leaveType === draft.leaveType)?.label ?? '';
  // A backup picked for other dates only counts while they are still suggested.
  const backup = impact.data?.backups.some((person) => person.id === draft.backupUserId)
    ? draft.backupUserId
    : null;
  const errors = form.fieldErrors;

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const body = {
      leaveType: draft.leaveType,
      fromDate: draft.fromDate,
      toDate: lastDay,
      halfDay: singleDay && draft.halfDay,
      reason: draft.reason.trim() || null,
      emergency: draft.emergency,
      backupUserId: backup,
      handoverNote: backup ? draft.handoverNote.trim() || null : null,
    };
    const saved = await form.run(() => expectStatus(api.workforce.applyLeave({ body }), 201));
    if (!saved) return;
    await refresh();
    toast({ title: t('sent'), reference: saved.leaveLabel, tone: 'success' });
    onOpenChange(false);
  };

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={t('title')}
      description={t('description')}
      width="lg"
      footer={
        <>
          <Button variant="quiet" onClick={() => onOpenChange(false)}>
            {t('cancel')}
          </Button>
          <Button type="submit" form={formId} variant="primary" pending={form.pending}>
            {t('submit')}
          </Button>
        </>
      }
    >
      <form
        id={formId}
        onSubmit={submit}
        noValidate
        className="flex flex-col gap-6 px-5 py-6 sm:px-6"
      >
        <Field label={t('kind')} error={errors.leaveType}>
          <Select
            value={draft.leaveType || undefined}
            onValueChange={(leaveType) => set({ leaveType })}
            options={kinds.map((kind) => ({ value: kind.leaveType, label: kind.label }))}
          />
        </Field>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Field label={t('from')} required error={errors.fromDate}>
            <Input
              type="date"
              value={draft.fromDate}
              min={draft.emergency ? undefined : todayIn()}
              onChange={(event) => set({ fromDate: event.target.value })}
            />
          </Field>
          <Field label={t('to')} hint={t('toHint')} error={errors.toDate}>
            <Input
              type="date"
              value={draft.toDate}
              min={draft.fromDate || undefined}
              onChange={(event) => set({ toDate: event.target.value })}
            />
          </Field>
        </div>
        <div className="flex flex-col gap-1">
          <Switch
            checked={singleDay && draft.halfDay}
            onCheckedChange={(halfDay) => set({ halfDay })}
            label={t('halfDay')}
            description={singleDay ? t('halfDayHint') : t('halfDayOneDay')}
            disabled={!singleDay}
          />
          {errors.halfDay && <p className="type-body-sm text-overdue">{errors.halfDay}</p>}
          <Switch
            checked={draft.emergency}
            onCheckedChange={(emergency) => set({ emergency })}
            label={t('emergency')}
            description={t('emergencyHint')}
          />
        </div>
        <Field label={t('reason')} hint={t('reasonHint')} error={errors.reason}>
          <Textarea
            rows={3}
            value={draft.reason}
            onChange={(event) => set({ reason: event.target.value })}
          />
        </Field>
        <LeaveImpactPanel
          impact={leaveWindow ? impact.data : undefined}
          loading={leaveWindow !== null && (impact.isFetching || !impact.data)}
          error={leaveWindow ? impact.error : null}
          kindLabel={kindLabel}
        />
        {leaveWindow && impact.data && (
          <LeaveCoverFields
            impact={impact.data}
            backupUserId={backup ?? NO_BACKUP}
            onBackupChange={(backupUserId) => set({ backupUserId })}
            handoverNote={draft.handoverNote}
            onNoteChange={(handoverNote) => set({ handoverNote })}
            errors={errors}
          />
        )}
        <FormError message={form.error} />
      </form>
    </Sheet>
  );
}
