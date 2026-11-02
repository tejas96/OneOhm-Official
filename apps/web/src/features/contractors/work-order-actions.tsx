'use client';

import type { WorkOrderDetail } from '@oneohm/api-contracts';
import {
  Button,
  Dialog,
  Field,
  Input,
  Select,
  Textarea,
  useToast,
} from '@oneohm/design-system/web';
import { Ban, HandCoins, Plus, Wrench } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { type FormEvent, type ReactNode, useId, useState } from 'react';
import { FormError } from '@/components/form-error';
import { NumberInput } from '@/features/settings/number-input';
import { api, expectStatus } from '@/lib/api/api-client';
import { useApiForm } from '@/lib/forms/use-api-form';
import { useRefreshContractors } from './use-contractors';

type Kind = 'line' | 'rework' | 'advance' | 'cancel';
const NONE = 'none';

/** Extra labour, rework with a deduction, an advance, or cancelling the order. */
export function WorkOrderActions({ order }: { readonly order: WorkOrderDetail }) {
  const t = useTranslations('contractors.actions');
  const [open, setOpen] = useState<Kind | null>(null);
  if (order.status === 'completed' || order.status === 'cancelled') return null;
  const button = (kind: Kind, icon: ReactNode, variant: 'secondary' | 'quiet' = 'secondary') => (
    <Button variant={variant} leadingIcon={icon} onClick={() => setOpen(kind)}>
      {t(`${kind}.open`)}
    </Button>
  );
  return (
    <div className="flex flex-wrap gap-2">
      {button('line', <Plus />)}
      {button('rework', <Wrench />)}
      {button('advance', <HandCoins />)}
      {button('cancel', <Ban />, 'quiet')}
      {open && <ActionDialog order={order} kind={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

function ActionDialog({
  order,
  kind,
  onClose,
}: {
  readonly order: WorkOrderDetail;
  readonly kind: Kind;
  readonly onClose: () => void;
}) {
  const t = useTranslations(`contractors.actions.${kind}`);
  const formId = useId();
  const toast = useToast();
  const refresh = useRefreshContractors();
  const form = useApiForm();
  const [text, setText] = useState('');
  const [amount, setAmount] = useState<number | null>(null);
  const [quantity, setQuantity] = useState<number | null>(1);
  const [taskId, setTaskId] = useState(NONE);
  const params = { id: order.id };

  const call = () => {
    if (kind === 'line')
      return expectStatus(
        api.contractors.addWorkOrderLine({
          params,
          body: {
            description: text,
            quantityMilli: (quantity ?? 0) * 1000,
            unitRatePaise: amount ?? 0,
          },
        }),
        201,
      );
    if (kind === 'rework')
      return expectStatus(
        api.contractors.recordRework({
          params,
          body: {
            note: text,
            deductionPaise: amount ?? 0,
            taskId: taskId === NONE ? null : taskId,
          },
        }),
        201,
      );
    if (kind === 'advance')
      return expectStatus(
        api.contractors.recordAdvance({
          params,
          body: { amountPaise: amount ?? 0, note: text || null },
        }),
        201,
      );
    return expectStatus(api.contractors.cancelWorkOrder({ params, body: { reason: text } }), 200);
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await form.run(call, async () => {
      await refresh();
      toast({ tone: 'success', title: t('done') });
      onClose();
    });
  };

  const errors = form.fieldErrors;
  return (
    <Dialog
      open
      onOpenChange={(next) => !next && onClose()}
      title={t('title')}
      description={t('description')}
      autoFocusField
      footer={
        <Button
          type="submit"
          form={formId}
          variant={kind === 'cancel' ? 'danger' : 'primary'}
          pending={form.pending}
        >
          {t('submit')}
        </Button>
      }
    >
      <form id={formId} onSubmit={submit} noValidate className="flex flex-col gap-4">
        {kind === 'rework' && (
          <Field label={t('task')}>
            <Select
              value={taskId}
              onValueChange={setTaskId}
              options={[
                { value: NONE, label: t('wholeOrder') },
                ...order.tasks.map((task) => ({ value: task.id, label: task.title })),
              ]}
            />
          </Field>
        )}
        <Field label={t('text')} error={errors.description ?? errors.note ?? errors.reason}>
          {kind === 'line' ? (
            <Input value={text} onChange={(event) => setText(event.target.value)} />
          ) : (
            <Textarea value={text} rows={3} onChange={(event) => setText(event.target.value)} />
          )}
        </Field>
        {kind === 'line' && (
          <Field label={t('quantity')} error={errors.quantityMilli}>
            <NumberInput unit="whole" value={quantity} onValueChange={setQuantity} />
          </Field>
        )}
        {kind !== 'cancel' && (
          <Field
            label={t('amount')}
            error={errors.unitRatePaise ?? errors.deductionPaise ?? errors.amountPaise}
          >
            <NumberInput unit="paise" value={amount} onValueChange={setAmount} />
          </Field>
        )}
        <FormError message={form.error} />
      </form>
    </Dialog>
  );
}
