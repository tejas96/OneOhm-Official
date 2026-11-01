'use client';

import type { Property } from '@oneohm/api-contracts';
import { Button, Dialog, useToast } from '@oneohm/design-system/web';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CircleAlert } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { type FormEvent, useState } from 'react';
import { api, expectStatus } from '@/lib/api/api-client';
import { ApiError, describeError } from '@/lib/api/api-error';
import { PropertyFields, readPropertyForm } from './property-fields';

/** Correct a site's address or electricity connection (survey, DISCOM or customer updates). */
export function EditPropertyDialog({
  property,
  open,
  onOpenChange,
}: {
  readonly property: Property;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations('customers.editProperty');
  const toast = useToast();
  const queryClient = useQueryClient();
  const [error, setError] = useState<ApiError | null>(null);
  const save = useMutation({
    mutationFn: (body: NonNullable<Parameters<typeof api.crm.updateProperty>[0]['body']>) =>
      expectStatus(api.crm.updateProperty({ params: { id: property.id }, body }), 200),
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
      description={property.label}
      size="lg"
      footer={
        <>
          <Button variant="quiet" onClick={() => onOpenChange(false)}>
            {t('cancel')}
          </Button>
          <Button
            type="submit"
            form={`property-${property.id}`}
            variant="primary"
            pending={save.isPending}
          >
            {t('submit')}
          </Button>
        </>
      }
    >
      <form
        id={`property-${property.id}`}
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
        <PropertyFields initial={property} errors={(field) => error?.fieldErrors[field]} />
      </form>
    </Dialog>
  );
}
