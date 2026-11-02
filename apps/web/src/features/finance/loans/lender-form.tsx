'use client';

import type { LendingPartner } from '@oneohm/api-contracts';
import { Button, Field, Input, Select, Textarea, useToast } from '@oneohm/design-system/web';
import { Check, Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { type FormEvent, useEffect, useId, useRef, useState } from 'react';
import { FormError } from '@/components/form-error';
import { api, expectStatus } from '@/lib/api/api-client';
import { useApiForm } from '@/lib/forms/use-api-form';
import { useInvalidateFinance } from '../use-finance';
import {
  LenderPatternEditor,
  type PartDraft,
  partsFromPattern,
  partsToPattern,
} from './lender-pattern-editor';

type Disbursement = LendingPartner['disbursement'];

const lines = (text: string) =>
  text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

/**
 * Adds a lender, or changes one: its name, how it pays (one payment, or parts with each
 * part's share) and the documents it always asks for.
 */
export function LenderForm({
  lender,
  onDone,
}: {
  /** The lender being changed; null adds a new one. */
  readonly lender: LendingPartner | null;
  readonly onDone: () => void;
}) {
  const t = useTranslations('finance.loans.lendersDialog');
  const formId = useId();
  const toast = useToast();
  const invalidate = useInvalidateFinance();
  const form = useApiForm();
  const ref = useRef<HTMLFormElement>(null);
  const [name, setName] = useState(lender?.name ?? '');
  const [documents, setDocuments] = useState(lender?.requiredDocuments.join('\n') ?? '');
  const [disbursement, setDisbursement] = useState<Disbursement>(lender?.disbursement ?? 'single');
  const [parts, setParts] = useState<PartDraft[]>(() =>
    partsFromPattern(lender?.tranchePattern ?? []),
  );

  // Edit sits below the list: bring the form into view when a lender is picked.
  useEffect(() => {
    if (lender) ref.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [lender]);

  const save = () => {
    const body = {
      name,
      disbursement,
      requiredDocuments: lines(documents),
      tranchePattern: disbursement === 'tranches' ? partsToPattern(parts) : [],
    };
    return lender
      ? expectStatus(api.finance.updateLender({ params: { id: lender.id }, body }), 200)
      : expectStatus(api.finance.createLender({ body: { ...body, active: true } }), 201);
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await form.run(save, async (saved) => {
      await invalidate();
      toast({ title: t(lender ? 'saved' : 'added', { name: saved.name }), tone: 'success' });
      if (!lender) {
        setName('');
        setDocuments('');
        setDisbursement('single');
        setParts(partsFromPattern([]));
      }
      onDone();
    });
  };

  return (
    <form
      ref={ref}
      id={formId}
      onSubmit={submit}
      noValidate
      aria-label={lender ? t('editTitle', { name: lender.name }) : t('newTitle')}
      className="grid gap-4 border-t border-hairline pt-5 sm:grid-cols-2"
    >
      <h3 className="type-title-md text-ink sm:col-span-2">
        {lender ? t('editTitle', { name: lender.name }) : t('newTitle')}
      </h3>
      <Field label={t('name')} required error={form.fieldErrors.name}>
        <Input value={name} maxLength={120} onChange={(event) => setName(event.target.value)} />
      </Field>
      <Field label={t('disbursement')}>
        <Select
          value={disbursement}
          onValueChange={setDisbursement}
          options={(['single', 'tranches'] as const).map((value) => ({
            value,
            label: t(`pattern.${value}`),
          }))}
        />
      </Field>
      {disbursement === 'tranches' && (
        <div className="sm:col-span-2">
          <LenderPatternEditor
            parts={parts}
            onChange={setParts}
            error={form.fieldErrors.tranchePattern}
          />
        </div>
      )}
      <Field label={t('documents')} hint={t('documentsHint')} className="sm:col-span-2">
        <Textarea
          rows={3}
          value={documents}
          onChange={(event) => setDocuments(event.target.value)}
        />
      </Field>
      <div className="flex flex-col gap-3 sm:col-span-2">
        <FormError message={form.fieldErrors.tranchePattern ? null : form.error} />
        <div className="flex flex-wrap justify-end gap-2">
          {lender && (
            <Button type="button" variant="quiet" onClick={onDone}>
              {t('cancel')}
            </Button>
          )}
          <Button
            type="submit"
            variant="primary"
            leadingIcon={lender ? <Check /> : <Plus />}
            pending={form.pending}
          >
            {lender ? t('save') : t('add')}
          </Button>
        </div>
      </div>
    </form>
  );
}
