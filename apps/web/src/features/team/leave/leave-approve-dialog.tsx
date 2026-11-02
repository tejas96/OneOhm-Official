'use client';

import type { LeaveImpact, LeaveRequestRecord } from '@oneohm/api-contracts';
import {
  Button,
  Checkbox,
  Dialog,
  Field,
  SegmentedControl,
  Select,
  Textarea,
} from '@oneohm/design-system/web';
import { Check, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { FormError } from '@/components/form-error';
import { ListSkeleton, LoadError } from '@/components/query-state';
import { useApiForm } from '@/lib/forms/use-api-form';
import { usePeople } from '../use-team';
import { affectedCount, LeaveAffectedWork } from './leave-affected-work';
import { useLeaveText } from './leave-facts';
import { type LeaveDecisionBody, useRequestImpact } from './use-leave';

const NONE = 'none';
type Choice = 'approve' | 'decline';

/** Suggested backups first, then anyone else active on the staff; never the person away. */
function useBackupOptions(leave: LeaveRequestRecord | null, impact: LeaveImpact | undefined) {
  const t = useTranslations('team.leave.approveDialog');
  const people = usePeople();
  const suggested = impact?.backups ?? [];
  const others = (people.data ?? []).filter(
    (person) =>
      person.status === 'active' &&
      person.id !== leave?.user.id &&
      person.roles.some((role) => role.kind === 'staff') &&
      !suggested.some((backup) => backup.id === person.id),
  );
  return [
    { value: NONE, label: t('noOne') },
    ...suggested.map((backup) => ({
      value: backup.id,
      label: backup.fullName,
      description: t('suggested', { count: backup.openTasks }),
    })),
    ...others.map((person) => ({
      value: person.id,
      label: person.fullName,
      description: t('openTasks', { count: person.openTasks }),
    })),
  ];
}

/**
 * Approve or decline leave (PRD 4.6, Flow E). Approving shows the work it touches and
 * who covers it; ordinary leave with open work needs a backup, emergency leave may go
 * ahead without one.
 */
export function LeaveApproveDialog({
  leave,
  leaning,
  onClose,
  onDecide,
}: {
  readonly leave: LeaveRequestRecord | null;
  readonly leaning: boolean;
  readonly onClose: () => void;
  readonly onDecide: (body: LeaveDecisionBody) => Promise<unknown>;
}) {
  const t = useTranslations('team.leave.approveDialog');
  const queueT = useTranslations('team.leave.queue');
  const { when } = useLeaveText();
  const form = useApiForm();
  const [choice, setChoice] = useState<Choice>('approve');
  const [note, setNote] = useState('');
  const [backup, setBackup] = useState(NONE);
  const [skip, setSkip] = useState(false);
  const impact = useRequestImpact(leave?.id ?? null);
  const options = useBackupOptions(leave, impact.data);
  const { reset } = form;

  useEffect(() => {
    if (!leave) return;
    setChoice(leaning ? 'approve' : 'decline');
    setNote('');
    setBackup(leave.backup?.id ?? NONE);
    setSkip(false);
    reset();
  }, [leave, leaning, reset]);

  const approving = choice === 'approve';
  const affected = impact.data ? affectedCount(impact.data) : 0;
  const submit = async () => {
    const body: LeaveDecisionBody = approving
      ? {
          approve: true,
          note: note.trim() || null,
          backupUserId: backup === NONE ? null : backup,
          skipHandover: skip && backup === NONE,
        }
      : { approve: false, note: note.trim() || null };
    await form.run(() => onDecide(body), onClose);
  };

  return (
    <Dialog
      open={leave !== null}
      onOpenChange={(open) => !open && onClose()}
      title={
        leave ? queueT('dialogTitle', { name: leave.user.fullName, kind: leave.leaveLabel }) : ''
      }
      description={leave ? when(leave) : undefined}
      size="md"
      footer={
        <>
          <Button variant="quiet" onClick={onClose}>
            {t('cancel')}
          </Button>
          <Button
            variant={approving ? 'primary' : 'danger'}
            pending={form.pending}
            onClick={submit}
          >
            {approving ? t('confirmApprove') : t('confirmDecline')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5 pb-2">
        <SegmentedControl
          value={choice}
          onValueChange={setChoice}
          label={t('choice')}
          options={[
            { value: 'approve', label: t('approve'), icon: <Check /> },
            { value: 'decline', label: t('decline'), icon: <X /> },
          ]}
          className="self-start"
        />
        {approving && (
          <section className="flex flex-col gap-3">
            <h3 className="type-overline text-ink-faint uppercase">{t('touches')}</h3>
            {impact.isPending && <ListSkeleton label={t('loading')} rows={2} />}
            {impact.isError && <LoadError error={impact.error} onRetry={() => impact.refetch()} />}
            {impact.data && <LeaveAffectedWork impact={impact.data} />}
          </section>
        )}
        {approving && impact.data && (
          <Field
            label={t('backup')}
            hint={affected > 0 ? t('backupHint') : t('backupHintNothing')}
            error={form.fieldErrors.backupUserId}
          >
            <Select value={backup} onValueChange={setBackup} options={options} />
          </Field>
        )}
        {approving && leave?.emergency && affected > 0 && backup === NONE && (
          <Checkbox
            checked={skip}
            onCheckedChange={setSkip}
            label={t('skip')}
            description={t('skipHint')}
          />
        )}
        <Field label={t('note')} hint={t('noteHint')} error={form.fieldErrors.note}>
          <Textarea rows={3} value={note} onChange={(event) => setNote(event.target.value)} />
        </Field>
        <FormError message={form.error} />
      </div>
    </Dialog>
  );
}
