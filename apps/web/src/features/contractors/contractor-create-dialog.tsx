'use client';

import { Button, Dialog, useToast } from '@oneohm/design-system/web';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { type FormEvent, useId, useState } from 'react';
import { FormError } from '@/components/form-error';
import { api, expectStatus } from '@/lib/api/api-client';
import { useApiForm } from '@/lib/forms/use-api-form';
import { ContractorFields, contractorBody, EMPTY_CONTRACTOR } from './contractor-fields';
import { useRefreshContractors } from './use-contractors';

/** Registers a contractor; the crew and rate card are added on its page next. */
export function ContractorCreateDialog({
  open,
  onOpenChange,
}: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations('contractors.create');
  const formId = useId();
  const toast = useToast();
  const router = useRouter();
  const refresh = useRefreshContractors();
  const form = useApiForm();
  const [draft, setDraft] = useState(EMPTY_CONTRACTOR);

  const close = (next: boolean) => {
    onOpenChange(next);
    if (!next) {
      setDraft(EMPTY_CONTRACTOR);
      form.reset();
    }
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const created = await form.run(() =>
      expectStatus(api.contractors.createContractor({ body: contractorBody(draft) }), 201),
    );
    if (!created) return;
    await refresh();
    toast({ tone: 'success', title: t('done', { name: created.name }) });
    close(false);
    router.push(`/contractors/${created.id}`);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={close}
      title={t('title')}
      description={t('description')}
      size="lg"
      autoFocusField
      footer={
        <Button type="submit" form={formId} variant="primary" pending={form.pending}>
          {t('submit')}
        </Button>
      }
    >
      <form id={formId} onSubmit={submit} noValidate className="flex flex-col gap-5">
        <ContractorFields draft={draft} onChange={setDraft} errors={form.fieldErrors} />
        <FormError message={form.error} />
      </form>
    </Dialog>
  );
}
