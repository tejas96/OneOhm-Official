'use client';

import { Button, Dialog, useToast } from '@oneohm/design-system/web';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { type FormEvent, useId, useState } from 'react';
import { FormError } from '@/components/form-error';
import { useBankCheck } from '@/features/inventory/vendors/bank-check';
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
  const [tried, setTried] = useState(false);
  const [draft, setDraft] = useState(EMPTY_CONTRACTOR);
  const bank = useBankCheck(draft);

  const close = (next: boolean) => {
    onOpenChange(next);
    if (!next) {
      setDraft(EMPTY_CONTRACTOR);
      setTried(false);
      form.reset();
    }
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (bank.blocked) {
      setTried(true);
      return;
    }
    await form.run(
      () => expectStatus(api.contractors.createContractor({ body: contractorBody(draft) }), 201),
      async (created) => {
        await refresh();
        toast({ tone: 'success', title: t('done', { name: created.name }) });
        close(false);
        router.push(`/contractors/${created.id}`);
      },
    );
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
        <Button
          type="submit"
          form={formId}
          variant="primary"
          pending={form.pending}
          disabled={bank.blocked}
        >
          {t('submit')}
        </Button>
      }
    >
      <form id={formId} onSubmit={submit} noValidate className="flex flex-col gap-5">
        <ContractorFields
          draft={draft}
          onChange={setDraft}
          errors={form.fieldErrors}
          bank={bank}
          showRequired={tried}
        />
        <FormError message={form.error} />
      </form>
    </Dialog>
  );
}
