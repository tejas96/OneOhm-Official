'use client';

import type { Customer } from '@oneohm/api-contracts';
import { Button, Field, Input, SegmentedControl, Sheet, useToast } from '@oneohm/design-system/web';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { type FormEvent, useId, useState } from 'react';
import { FormError } from '@/components/form-error';
import { api, expectStatus } from '@/lib/api/api-client';
import { useApiForm } from '@/lib/forms/use-api-form';

type Kind = Customer['kind'];
const KINDS: readonly Kind[] = ['individual', 'organization'];

/** Correct who the customer is: name, phone, email, person or organisation, GSTIN (PRD 3.2). */
export function EditCustomerSheet({
  customer,
  open,
  onOpenChange,
}: {
  readonly customer: Customer;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations('customers.edit');
  const toast = useToast();
  const queryClient = useQueryClient();
  const formId = useId();
  const form = useApiForm();

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const text = (name: string) => String(data.get(name) ?? '').trim();
    await form.run(
      () =>
        expectStatus(
          api.crm.updateCustomer({
            params: { id: customer.id },
            body: {
              name: text('name'),
              phone: text('phone'),
              email: text('email') || null,
              kind: text('kind') as Kind,
              gstin: text('gstin') || null,
            },
          }),
          200,
        ),
      async () => {
        await queryClient.invalidateQueries({ queryKey: ['customers'] });
        toast({ tone: 'success', title: t('saved') });
        onOpenChange(false);
      },
    );
  };

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) form.reset();
        onOpenChange(next);
      }}
      title={t('title')}
      description={t('description')}
      autoFocusField
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
        key={String(open)}
        id={formId}
        onSubmit={submit}
        noValidate
        className="flex flex-col gap-5 px-5 py-6 sm:px-6"
      >
        <FormError message={form.error} />
        <CustomerFields customer={customer} errors={form.fieldErrors} />
      </form>
    </Sheet>
  );
}

function CustomerFields({
  customer,
  errors,
}: {
  readonly customer: Customer;
  readonly errors: Readonly<Record<string, string>>;
}) {
  const t = useTranslations('customers.edit');
  const kindT = useTranslations('customers.kind');
  const [kind, setKind] = useState<Kind>(customer.kind);
  return (
    <>
      <input type="hidden" name="kind" value={kind} />
      <div className="flex flex-col gap-1.5">
        <span className="type-label text-ink-muted">{t('kind')}</span>
        <SegmentedControl
          label={t('kind')}
          size="sm"
          value={kind}
          onValueChange={setKind}
          options={KINDS.map((value) => ({ value, label: kindT(value) }))}
          className="self-start"
        />
      </div>
      <Field label={t('name')} required error={errors.name}>
        <Input name="name" autoComplete="name" defaultValue={customer.name} />
      </Field>
      <Field label={t('phone')} hint={t('phoneHint')} required error={errors.phone}>
        <Input
          name="phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          defaultValue={customer.phone.replace(/^\+91/, '')}
        />
      </Field>
      <Field label={t('email')} hint={t('emailHint')} error={errors.email}>
        <Input name="email" type="email" autoComplete="email" defaultValue={customer.email ?? ''} />
      </Field>
      <Field label={t('gstin')} hint={t('gstinHint')} error={errors.gstin}>
        <Input
          name="gstin"
          autoCapitalize="characters"
          maxLength={20}
          className="font-mono uppercase"
          defaultValue={customer.gstin ?? ''}
        />
      </Field>
    </>
  );
}
