'use client';

import type { LeadDetail } from '@oneohm/api-contracts';
import { Button, Dialog, SegmentedControl, useToast } from '@oneohm/design-system/web';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CircleAlert } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { type FormEvent, useState } from 'react';
import { PropertyFields, readPropertyForm } from '@/features/customers/property-fields';
import { api, expectStatus } from '@/lib/api/api-client';
import { ApiError, describeError } from '@/lib/api/api-error';
import { leadKeys } from './lead-labels';

type Kind = 'individual' | 'organization';

/**
 * Turns the lead into a customer (matched by phone, never duplicated) with the site's
 * property and electricity connection, ready for a quotation.
 */
export function ConvertLeadDialog({
  lead,
  open,
  onOpenChange,
}: {
  readonly lead: LeadDetail;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations('leads.convert');
  const toast = useToast();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [kind, setKind] = useState<Kind>(
    lead.subsidyCategory === 'individual' ? 'individual' : 'organization',
  );
  const [error, setError] = useState<ApiError | null>(null);
  const convert = useMutation({
    mutationFn: (body: Parameters<typeof api.crm.convertLead>[0]['body']) =>
      expectStatus(api.crm.convertLead({ params: { id: lead.id }, body }), 201),
    onSuccess: async (result) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: leadKeys.all }),
        queryClient.invalidateQueries({ queryKey: ['customers'] }),
      ]);
      onOpenChange(false);
      toast({
        tone: 'success',
        title: t('done', { name: lead.name }),
        action: {
          label: t('createQuotation'),
          onSelect: () => router.push(`/quotations/new?propertyId=${result.propertyId}&leadId=${lead.id}`),
        },
      });
    },
    onError: (caught) =>
      setError(
        caught instanceof ApiError ? caught : new ApiError(0, describeError(caught), undefined, {}),
      ),
  });

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    convert.mutate({ kind, property: readPropertyForm(new FormData(event.currentTarget)) });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setError(null);
        onOpenChange(next);
      }}
      title={t('title')}
      description={t('description', { name: lead.name })}
      size="lg"
      autoFocusField
      footer={
        <>
          <Button variant="quiet" onClick={() => onOpenChange(false)}>
            {t('cancel')}
          </Button>
          <Button type="submit" form="lead-convert" variant="primary" pending={convert.isPending}>
            {t('submit')}
          </Button>
        </>
      }
    >
      <form id="lead-convert" onSubmit={submit} className="flex flex-col gap-5 py-1" noValidate>
        {error && (
          <p
            role="alert"
            className="flex items-start gap-2 rounded-lg bg-overdue-tint px-3.5 py-3 type-body-sm text-overdue"
          >
            <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
            {error.message}
          </p>
        )}
        <div className="flex flex-col gap-1.5">
          <span className="type-label text-ink-muted">{t('kind')}</span>
          <SegmentedControl
            label={t('kind')}
            size="sm"
            value={kind}
            onValueChange={setKind}
            options={(['individual', 'organization'] as const).map((value) => ({
              value,
              label: t(`kinds.${value}`),
            }))}
            className="self-start"
          />
        </div>
        <PropertyFields
          defaultCategory={lead.subsidyCategory}
          defaultCity={lead.city}
          errors={(field) => error?.fieldErrors[`property.${field}`]}
        />
      </form>
    </Dialog>
  );
}
