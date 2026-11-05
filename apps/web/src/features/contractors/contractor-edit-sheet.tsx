'use client';

import type { ContractorDetail } from '@oneohm/api-contracts';
import { Button, Sheet, Switch, useToast } from '@oneohm/design-system/web';
import { useTranslations } from 'next-intl';
import { type FormEvent, useEffect, useId, useState } from 'react';
import { FormError } from '@/components/form-error';
import { useBankCheck } from '@/features/inventory/vendors/bank-check';
import { api, expectStatus } from '@/lib/api/api-client';
import { useApiForm } from '@/lib/forms/use-api-form';
import { ContractorFields, contractorBody, draftFrom } from './contractor-fields';
import { useRefreshContractors } from './use-contractors';

/** Edit a contractor's profile and terms, or archive them (history stays). */
export function ContractorEditSheet({
  contractor,
  open,
  onOpenChange,
}: {
  readonly contractor: ContractorDetail;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations('contractors.editSheet');
  const formId = useId();
  const toast = useToast();
  const refresh = useRefreshContractors();
  const form = useApiForm();
  const [tried, setTried] = useState(false);
  const [draft, setDraft] = useState(() => draftFrom(contractor));
  const bank = useBankCheck(draft);
  const [active, setActive] = useState(contractor.active);

  useEffect(() => {
    if (open) {
      setDraft(draftFrom(contractor));
      setActive(contractor.active);
      setTried(false);
    }
  }, [open, contractor]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (bank.blocked) {
      setTried(true);
      return;
    }
    await form.run(
      () =>
        expectStatus(
          api.contractors.updateContractor({
            params: { id: contractor.id },
            body: { ...contractorBody(draft), active },
          }),
          200,
        ),
      async () => {
        await refresh();
        toast({ tone: 'success', title: t('saved') });
        onOpenChange(false);
      },
    );
  };

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={t('title')}
      description={contractor.name}
      width="lg"
      footer={
        <Button
          type="submit"
          form={formId}
          variant="primary"
          pending={form.pending}
          disabled={bank.blocked}
        >
          {t('save')}
        </Button>
      }
    >
      <form
        id={formId}
        onSubmit={submit}
        noValidate
        className="flex flex-col gap-6 px-5 py-6 sm:px-6"
      >
        <ContractorFields
          draft={draft}
          onChange={setDraft}
          errors={form.fieldErrors}
          savedAccount={contractor.bankAccountMasked}
          bank={bank}
          showRequired={tried}
        />
        <Switch
          label={t('active')}
          description={t('activeHint')}
          checked={active}
          onCheckedChange={setActive}
        />
        <FormError message={form.error} />
      </form>
    </Sheet>
  );
}
