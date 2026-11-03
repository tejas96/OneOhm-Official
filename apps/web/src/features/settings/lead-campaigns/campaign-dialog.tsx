'use client';

import type { LeadCampaignRecord } from '@oneohm/api-contracts';
import { Button, Dialog, Field, Input } from '@oneohm/design-system/web';
import { useTranslations } from 'next-intl';
import { type FormEvent, useEffect, useId, useState } from 'react';
import { useChangeLeadCampaigns } from './use-lead-campaigns';

export interface CampaignDraft {
  /** null adds a new code. */
  readonly campaign: LeadCampaignRecord | null;
}

const CODE_PATTERN = /^[A-Z0-9_-]{2,20}$/;

/** Add a code with a name, or rename one; the code itself never changes. */
export function CampaignDialog({
  draft,
  onClose,
}: {
  readonly draft: CampaignDraft | null;
  readonly onClose: () => void;
}) {
  const t = useTranslations('settings.leadCampaigns.dialog');
  const formId = useId();
  const change = useChangeLeadCampaigns(onClose);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  useEffect(() => {
    if (draft) {
      setCode(draft.campaign?.code ?? '');
      setName(draft.campaign?.name ?? '');
    }
  }, [draft]);
  const valid = name.trim().length >= 2 && (draft?.campaign !== null || CODE_PATTERN.test(code));
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!draft || !valid) return;
    if (draft.campaign)
      change.mutate({ kind: 'update', code: draft.campaign.code, body: { name: name.trim() } });
    else change.mutate({ kind: 'add', code, name: name.trim() });
  };
  return (
    <Dialog
      open={draft !== null}
      onOpenChange={(open) => !open && onClose()}
      title={draft?.campaign ? t('editTitle', { code: draft.campaign.code }) : t('addTitle')}
      description={t('description')}
      autoFocusField
      footer={
        <>
          <Button variant="quiet" onClick={onClose}>
            {t('cancel')}
          </Button>
          <Button
            type="submit"
            form={formId}
            variant="primary"
            pending={change.isPending}
            disabled={!valid}
          >
            {draft?.campaign ? t('save') : t('add')}
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={submit} noValidate className="flex flex-col gap-5 pb-2">
        <Field label={t('code')} hint={t('codeHint')} required>
          <Input
            value={code}
            maxLength={20}
            disabled={draft?.campaign != null}
            onChange={(event) => setCode(event.target.value.toUpperCase())}
          />
        </Field>
        <Field label={t('name')} hint={t('nameHint')} required>
          <Input value={name} maxLength={60} onChange={(event) => setName(event.target.value)} />
        </Field>
      </form>
    </Dialog>
  );
}
