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
  useToast,
} from '@oneohm/design-system/web';
import { Check, TriangleAlert, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { type ReactNode, useEffect, useState } from 'react';
import { FormError } from '@/components/form-error';
import { ListSkeleton, LoadError } from '@/components/query-state';
import { useApiForm } from '@/lib/forms/use-api-form';
import { NONE, useBackupOptions } from './backup-options';
import { affectedCount, LeaveAffectedWork } from './leave-affected-work';
import { LeaveClashNotes } from './leave-clash-notes';
import { LeaveCover, useLeaveText } from './leave-facts';
import { type LeaveDecisionBody, useChangeBackup, useRequestImpact } from './use-leave';

type Choice = 'approve' | 'decline';

function confirmKey(asking: boolean, approving: boolean) {
  if (asking) return 'askToCover';
  return approving ? 'confirmApprove' : 'confirmDecline';
}

function hintKey(asking: boolean, affected: number) {
  if (asking) return 'askHint';
  return affected > 0 ? 'backupHint' : 'backupHintNothing';
}

/** What to know before choosing who covers: nobody on late work, and the backup's answer. */
function BackupNotes({
  leave,
  impact,
  backup,
}: {
  readonly leave: LeaveRequestRecord;
  readonly impact: LeaveImpact;
  readonly backup: string;
}) {
  const t = useTranslations('team.leave.approveDialog');
  const queueT = useTranslations('team.leave.queue');
  const waiting = leave.backup && backup === leave.backup.id && leave.coverAnswer !== 'accepted';
  return (
    <>
      {backup === NONE && impact.dueInWindow > 0 && (
        <Warning>{queueT('nobodyCovering', { count: impact.dueInWindow })}</Warning>
      )}
      {leave.backup && <LeaveCover leave={leave} />}
      {waiting && leave.backup && (
        <Warning>{t('waitsForYes', { name: leave.backup.fullName })}</Warning>
      )}
    </>
  );
}

function Warning({ children }: { readonly children: ReactNode }) {
  return (
    <p className="flex items-start gap-2 rounded-md bg-at-risk-tint px-3 py-2.5 type-body-sm text-ink">
      <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-at-risk" />
      {children}
    </p>
  );
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
  const toast = useToast();
  const changeBackup = useChangeBackup();
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
  // Someone new has to be asked first; approving never hands work to a person who was not.
  const asking = approving && backup !== NONE && backup !== leave?.backup?.id;
  const submit = async () => {
    if (asking && leave) {
      await form.run(
        () => changeBackup(leave.id, backup),
        () => {
          toast({ title: t('asked'), reference: leave.leaveLabel, tone: 'success' });
          onClose();
        },
      );
      return;
    }
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
            {t(confirmKey(asking, approving))}
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
        {approving && impact.data && leave && (
          <>
            <LeaveClashNotes clashes={impact.data.clashes} applicant={leave.user.fullName} />
            <BackupNotes leave={leave} impact={impact.data} backup={backup} />
          </>
        )}
        {approving && impact.data && (
          <Field
            label={t('backup')}
            hint={t(hintKey(asking, affected))}
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
        <Field
          label={t('note')}
          hint={t(approving ? 'noteHint' : 'noteHintDecline')}
          required={!approving}
          error={form.fieldErrors.note}
        >
          <Textarea rows={3} value={note} onChange={(event) => setNote(event.target.value)} />
        </Field>
        <FormError message={form.error} />
      </div>
    </Dialog>
  );
}
