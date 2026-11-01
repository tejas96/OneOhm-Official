'use client';

import type { PurchaseRequest } from '@oneohm/api-contracts';
import { Button, Dialog, Field, Textarea, useToast } from '@oneohm/design-system/web';
import { Ban, Check, ClipboardList, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { type FormEvent, useId, useState } from 'react';
import { FormError } from '@/components/form-error';
import { api, expectStatus } from '@/lib/api/api-client';
import { useApiForm } from '@/lib/forms/use-api-form';
import { useCan, useCurrentUser } from '@/providers/current-user';
import { useRefreshPurchasing } from '../use-purchasing';

type Decision = 'approve' | 'reject';

/** Procurement approves or rejects with a note; an approved request becomes an order. */
export function RequestActions({
  request,
  onOrder,
}: {
  readonly request: PurchaseRequest;
  readonly onOrder: () => void;
}) {
  const t = useTranslations('purchasing.requests.actions');
  const user = useCurrentUser();
  const canBuy = useCan('procurement.manage');
  const [deciding, setDeciding] = useState<Decision | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const mine = request.requestedBy.id === user.id;
  const open = request.status === 'pending' || request.status === 'approved';

  return (
    <div className="flex w-full flex-wrap justify-end gap-2">
      {open && (mine || canBuy) && (
        <Button variant="quiet" leadingIcon={<Ban />} onClick={() => setCancelling(true)}>
          {t('cancel')}
        </Button>
      )}
      {canBuy && request.status === 'pending' && (
        <>
          <Button variant="secondary" leadingIcon={<X />} onClick={() => setDeciding('reject')}>
            {t('reject')}
          </Button>
          <Button variant="primary" leadingIcon={<Check />} onClick={() => setDeciding('approve')}>
            {t('approve')}
          </Button>
        </>
      )}
      {canBuy && request.status === 'approved' && (
        <Button variant="primary" leadingIcon={<ClipboardList />} onClick={onOrder}>
          {t('order')}
        </Button>
      )}
      <DecisionDialog request={request} decision={deciding} onClose={() => setDeciding(null)} />
      <CancelDialog request={request} open={cancelling} onClose={() => setCancelling(false)} />
    </div>
  );
}

function DecisionDialog({
  request,
  decision,
  onClose,
}: {
  readonly request: PurchaseRequest;
  readonly decision: Decision | null;
  readonly onClose: () => void;
}) {
  const t = useTranslations('purchasing.requests.actions');
  const formId = useId();
  const toast = useToast();
  const refresh = useRefreshPurchasing();
  const form = useApiForm();
  const [note, setNote] = useState('');
  const close = () => {
    setNote('');
    form.reset();
    onClose();
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!decision) return;
    const params = { id: request.id };
    const saved = await form.run(() =>
      decision === 'approve'
        ? expectStatus(api.purchasing.requests.approve({ params, body: { note } }), 200)
        : expectStatus(api.purchasing.requests.reject({ params, body: { note } }), 200),
    );
    if (!saved) return;
    await refresh();
    toast({ tone: 'success', title: t(`done.${decision}`, { number: saved.number }) });
    close();
  };

  return (
    <Dialog
      open={decision !== null}
      onOpenChange={(next) => !next && close()}
      title={decision ? t(`${decision}Title`, { number: request.number }) : ''}
      description={decision ? t(`${decision}Body`, { name: request.requestedBy.fullName }) : ''}
      autoFocusField
      footer={
        <Button
          type="submit"
          form={formId}
          variant={decision === 'reject' ? 'danger' : 'primary'}
          pending={form.pending}
        >
          {decision ? t(decision) : ''}
        </Button>
      }
    >
      <form id={formId} onSubmit={submit} noValidate className="flex flex-col gap-4">
        <Field
          label={t('note')}
          hint={decision === 'reject' ? t('noteNeeded') : t('noteOptional')}
          required={decision === 'reject'}
          error={form.fieldErrors.note}
        >
          <Textarea rows={3} value={note} onChange={(event) => setNote(event.target.value)} />
        </Field>
        <FormError message={form.error} />
      </form>
    </Dialog>
  );
}

function CancelDialog({
  request,
  open,
  onClose,
}: {
  readonly request: PurchaseRequest;
  readonly open: boolean;
  readonly onClose: () => void;
}) {
  const t = useTranslations('purchasing.requests.actions');
  const toast = useToast();
  const refresh = useRefreshPurchasing();
  const form = useApiForm();
  const confirm = async () => {
    const saved = await form.run(() =>
      expectStatus(api.purchasing.requests.cancel({ params: { id: request.id } }), 200),
    );
    if (!saved) return;
    await refresh();
    toast({ tone: 'success', title: t('done.cancel', { number: saved.number }) });
    onClose();
  };
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => !next && onClose()}
      title={t('cancelTitle', { number: request.number })}
      description={t('cancelBody')}
      size="sm"
      footer={
        <>
          <Button variant="quiet" onClick={onClose}>
            {t('keep')}
          </Button>
          <Button variant="danger" pending={form.pending} onClick={confirm}>
            {t('cancel')}
          </Button>
        </>
      }
    >
      <FormError message={form.error} />
    </Dialog>
  );
}
