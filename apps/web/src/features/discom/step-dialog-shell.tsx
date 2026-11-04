'use client';

import { Button, Dialog, useToast } from '@oneohm/design-system/web';
import { type FormEvent, type ReactNode, useId } from 'react';
import { FormError } from '@/components/form-error';
import { type ApiFormState, useApiForm } from '@/lib/forms/use-api-form';
import { useRefreshDiscom } from './use-discom';

/** The dialog every DISCOM step action uses: its form, one submit button and any error. */
export function StepDialog({
  title,
  description,
  submit,
  danger = false,
  onClose,
  form,
  onSubmit,
  children,
}: {
  readonly title: string;
  readonly description: string;
  readonly submit: string;
  readonly danger?: boolean;
  readonly onClose: () => void;
  readonly form: ApiFormState;
  readonly onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  readonly children: ReactNode;
}) {
  const formId = useId();
  return (
    <Dialog
      open
      onOpenChange={(next) => !next && onClose()}
      title={title}
      description={description}
      autoFocusField
      footer={
        <Button
          type="submit"
          form={formId}
          variant={danger ? 'danger' : 'primary'}
          pending={form.pending}
        >
          {submit}
        </Button>
      }
    >
      <form id={formId} onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        {children}
        <FormError message={form.error} />
      </form>
    </Dialog>
  );
}

/** Runs a step action, then refreshes the desk, says it is done and closes. */
export function useStepSave(onClose: () => void) {
  const toast = useToast();
  const refresh = useRefreshDiscom();
  const form = useApiForm();
  const save = async <T,>(action: () => Promise<T>, done: string) => {
    await form.run(action, async () => {
      await refresh();
      toast({ tone: 'success', title: done });
      onClose();
    });
  };
  return { form, save };
}
