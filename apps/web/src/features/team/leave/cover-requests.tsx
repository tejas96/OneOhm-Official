'use client';

import type { LeaveRequestRecord } from '@oneohm/api-contracts';
import {
  Button,
  Dialog,
  Field,
  listItemEnter,
  StatusPill,
  Textarea,
  useToast,
} from '@oneohm/design-system/web';
import { todayIn } from '@oneohm/shared';
import { motion } from 'motion/react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { FormError } from '@/components/form-error';
import { useApiForm } from '@/lib/forms/use-api-form';
import { useWorkforceFormat } from '../workforce-format';
import { useLeaveText } from './leave-facts';
import { useAnswerCover, useCoveringLeave } from './use-leave';

/** Still open to answer, or still ahead: older cover is history. */
function openCover(requests: readonly LeaveRequestRecord[]) {
  const today = todayIn();
  return requests.filter(
    (item) => item.status === 'pending' || (item.status === 'approved' && item.toDate >= today),
  );
}

/** The list, fetched here; nothing at all when there is nothing to answer or remember. */
export function CoverSection() {
  const covering = useCoveringLeave(true);
  const open = openCover(covering.data ?? []);
  return open.length > 0 ? <CoverRequests requests={open} /> : null;
}

/** Leave the signed-in person is asked to cover: say yes or no, with a note. */
export function CoverRequests({ requests }: { readonly requests: readonly LeaveRequestRecord[] }) {
  const t = useTranslations('team.leave.cover');
  const format = useWorkforceFormat();
  const { length } = useLeaveText();
  const [answering, setAnswering] = useState<{
    leave: LeaveRequestRecord;
    accept: boolean;
  } | null>(null);

  return (
    <section aria-label={t('askedTitle')} className="flex flex-col gap-3">
      <div className="flex flex-col gap-0.5">
        <h3 className="type-title-md text-ink">{t('askedTitle')}</h3>
        <p className="type-body-sm text-ink-faint">{t('askedDescription')}</p>
      </div>
      <ul className="flex flex-col gap-3">
        {requests.map((item, index) => (
          <motion.li
            key={item.id}
            {...listItemEnter(index)}
            className="flex flex-col gap-3 rounded-lg border border-hairline bg-raised p-4"
          >
            <div className="flex flex-col gap-0.5">
              <p className="type-title-md text-ink">{t('who', { name: item.user.fullName })}</p>
              <p className="type-body-sm text-ink-muted">
                {format.range(item.fromDate, item.toDate)} · {length(item)}
              </p>
            </div>
            {item.handoverNote && (
              <p className="type-body-sm text-ink-muted">“{item.handoverNote}”</p>
            )}
            {item.status === 'pending' && item.coverAnswer === 'asked' ? (
              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={() => setAnswering({ leave: item, accept: true })}>
                  {t('accept')}
                </Button>
                <Button
                  size="sm"
                  variant="quiet"
                  onClick={() => setAnswering({ leave: item, accept: false })}
                >
                  {t('decline')}
                </Button>
              </div>
            ) : (
              <CoverStatus leave={item} />
            )}
          </motion.li>
        ))}
      </ul>
      <AnswerDialog answering={answering} onClose={() => setAnswering(null)} />
    </section>
  );
}

/** What the signed-in person answered, or where the request stands now. */
function CoverStatus({ leave }: { readonly leave: LeaveRequestRecord }) {
  const t = useTranslations('team.leave.cover');
  if (leave.coverAnswer === 'accepted' || leave.coverAnswer === 'declined') {
    return (
      <div className="flex flex-col gap-1">
        <StatusPill
          size="sm"
          tone={leave.coverAnswer === 'accepted' ? 'onTrack' : 'overdue'}
          label={t(leave.coverAnswer === 'accepted' ? 'youAccepted' : 'youDeclined')}
        />
        {leave.coverNote && <p className="type-body-sm text-ink-muted">“{leave.coverNote}”</p>}
      </div>
    );
  }
  return null;
}

function AnswerDialog({
  answering,
  onClose,
}: {
  readonly answering: { leave: LeaveRequestRecord; accept: boolean } | null;
  readonly onClose: () => void;
}) {
  const t = useTranslations('team.leave.cover');
  const toast = useToast();
  const answer = useAnswerCover();
  const form = useApiForm();
  const [note, setNote] = useState('');
  const { reset } = form;
  const [shown, setShown] = useState(answering);
  // Start each answer with an empty note and no old error.
  if (answering !== shown) {
    setShown(answering);
    if (answering) {
      setNote('');
      reset();
    }
  }

  const submit = async () => {
    if (!answering) return;
    const { leave, accept } = answering;
    await form.run(
      () => answer(leave.id, { accept, note: note.trim() || null }),
      () => {
        toast({
          title: t(accept ? 'accepted' : 'declined'),
          reference: leave.leaveLabel,
          tone: 'success',
        });
        onClose();
      },
    );
  };

  const accept = answering?.accept ?? true;
  return (
    <Dialog
      open={answering !== null}
      onOpenChange={(open) => !open && onClose()}
      title={answering ? t(accept ? 'acceptTitle' : 'declineTitle') : ''}
      description={answering ? t('who', { name: answering.leave.user.fullName }) : undefined}
      size="sm"
      footer={
        <>
          <Button variant="quiet" onClick={onClose}>
            {t('back')}
          </Button>
          <Button variant={accept ? 'primary' : 'danger'} pending={form.pending} onClick={submit}>
            {t(accept ? 'confirmAccept' : 'confirmDecline')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3 pb-2">
        <Field
          label={t('note')}
          hint={t(accept ? 'noteHintAccept' : 'noteHintDecline')}
          required={!accept}
          error={form.fieldErrors.note}
        >
          <Textarea rows={3} value={note} onChange={(event) => setNote(event.target.value)} />
        </Field>
        <FormError message={form.error} />
      </div>
    </Dialog>
  );
}
