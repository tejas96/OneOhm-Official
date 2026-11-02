'use client';

import { Button, Dialog, useToast } from '@oneohm/design-system/web';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CircleAlert } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { type FormEvent, useRef, useState } from 'react';
import { api, expectStatus } from '@/lib/api/api-client';
import { ApiError, describeError } from '@/lib/api/api-error';
import { useRevealError } from '@/lib/forms/use-reveal-error';
import { PropertyFields, readPropertyForm } from './property-fields';

/** Another site for a customer we already know: a second home, a shop or a farm. */
export function AddPropertyDialog({
  customerId,
  customerName,
  defaultCity,
  open,
  onOpenChange,
}: {
  readonly customerId: string;
  readonly customerName: string;
  readonly defaultCity?: string | undefined;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations('customers.addProperty');
  const toast = useToast();
  const queryClient = useQueryClient();
  const [error, setError] = useState<ApiError | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  useRevealError(formRef, error);
  const save = useMutation({
    mutationFn: (body: Parameters<typeof api.crm.addProperty>[0]['body']) =>
      expectStatus(api.crm.addProperty({ params: { id: customerId }, body }), 201),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['customers'] });
      toast({ tone: 'success', title: t('saved') });
      onOpenChange(false);
    },
    onError: (caught) =>
      setError(
        caught instanceof ApiError ? caught : new ApiError(0, describeError(caught), undefined, {}),
      ),
  });

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (save.isPending) return;
    setError(null);
    save.mutate(readPropertyForm(new FormData(event.currentTarget)));
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setError(null);
        onOpenChange(next);
      }}
      title={t('title')}
      description={t('description', { name: customerName })}
      size="lg"
      autoFocusField
      footer={
        <>
          <Button variant="quiet" onClick={() => onOpenChange(false)}>
            {t('cancel')}
          </Button>
          <Button
            type="submit"
            form={`add-property-${customerId}`}
            variant="primary"
            pending={save.isPending}
          >
            {t('submit')}
          </Button>
        </>
      }
    >
      <form
        ref={formRef}
        id={`add-property-${customerId}`}
        onSubmit={submit}
        className="flex flex-col gap-5 py-1"
        noValidate
      >
        {error && (
          <p
            role="alert"
            className="flex items-start gap-2 rounded-lg bg-overdue-tint px-3.5 py-3 type-body-sm text-overdue"
          >
            <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
            {error.message}
          </p>
        )}
        {open && (
          <PropertyFields
            defaultCity={defaultCity}
            defaultLabel=""
            errors={(field) => error?.fieldErrors[field]}
          />
        )}
      </form>
    </Dialog>
  );
}
