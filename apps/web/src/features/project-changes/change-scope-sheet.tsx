'use client';

import type { ProjectDetail, QuotationDetail } from '@oneohm/api-contracts';
import { Button, Field, Sheet, Skeleton, Textarea, useToast } from '@oneohm/design-system/web';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { type FormEvent, useId, useMemo, useState } from 'react';
import { FormError } from '@/components/form-error';
import { LoadError } from '@/components/query-state';
import { useCatalog } from '@/features/quotations/builder/use-builder';
import { api, expectStatus } from '@/lib/api/api-client';
import { describeError } from '@/lib/api/api-error';
import { useApiForm } from '@/lib/forms/use-api-form';
import { type ChangeDraft, changeBody, draftChanges, draftFrom } from './change-draft';
import { ChangeFormFields } from './change-form-fields';
import { ChangeImpactView } from './change-impact-view';
import { useChangeActions, useChangePreview } from './use-project-changes';

/** The form once the accepted quotation and catalog are here; the impact follows the edits. */
function ChangeForm({
  project,
  accepted,
  formId,
  form,
  onRaised,
}: {
  readonly project: ProjectDetail;
  readonly accepted: QuotationDetail;
  readonly formId: string;
  readonly form: ReturnType<typeof useApiForm>;
  readonly onRaised: () => void;
}) {
  const t = useTranslations('scopeChanges.form');
  const catalog = useCatalog();
  const toast = useToast();
  const { raise } = useChangeActions(project.id);
  const [draft, setDraft] = useState<ChangeDraft>(() => draftFrom(accepted.input));
  const patch = (next: Partial<ChangeDraft>) => setDraft((now) => ({ ...now, ...next }));
  const { reason: _reason, ...priced } = draft;
  const changed = draftChanges(accepted.input, draft);
  // The reason is left out, so typing it does not price again; the same choices keep one body.
  const key = JSON.stringify(changed ? changeBody(accepted.input, priced) : null);
  const body = useMemo(() => JSON.parse(key) as ReturnType<typeof changeBody>, [key]);
  const preview = useChangePreview(project.id, body);
  const errors = { ...preview.fieldErrors, ...form.fieldErrors };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const full = changeBody(accepted.input, draft, draft.reason);
    if (!full) return;
    const raised = await form.run(() => raise(full));
    if (!raised) return;
    toast({ tone: 'success', title: t('raised', { number: raised.number }) });
    onRaised();
  };

  if (catalog.isPending) return <Skeleton className="m-6 h-64 rounded-xl" />;
  if (catalog.isError) return <LoadError error={catalog.error} onRetry={() => catalog.refetch()} />;
  return (
    <form
      id={formId}
      onSubmit={submit}
      noValidate
      className="flex flex-col gap-8 px-5 py-6 sm:px-6"
    >
      <ChangeFormFields
        draft={draft}
        patch={patch}
        catalog={catalog.data}
        keptExtras={accepted.input.extras ?? []}
        errors={errors}
      />
      <Field label={t('reason')} hint={t('reasonHint')} error={errors.reason} required>
        <Textarea
          rows={2}
          value={draft.reason}
          onChange={(event) => patch({ reason: event.target.value })}
        />
      </Field>
      <section className="flex flex-col gap-4 rounded-2xl bg-sunken/60 p-4 ring-1 ring-hairline sm:p-5">
        <h3 className="type-title-md text-ink">{t('impact')}</h3>
        {!changed && <p className="type-body-sm text-ink-muted">{t('nothingYet')}</p>}
        {changed && preview.error && (
          <p role="alert" className="type-body-sm text-overdue">
            {describeError(preview.error)}
          </p>
        )}
        {changed && !preview.impact && !preview.error && <Skeleton className="h-48 rounded-xl" />}
        {changed && preview.impact && (
          <ChangeImpactView impact={preview.impact} updating={preview.updating} />
        )}
      </section>
      <FormError message={form.error} />
    </form>
  );
}

/**
 * "Change scope" (PRD 3.6, 3.15): size, products, structure or an extra line, with the
 * impact shown as it is filled in. Raising sends it to a project manager to approve.
 */
export function ChangeScopeSheet({
  project,
  open,
  onClose,
  blockedBy,
}: {
  readonly project: ProjectDetail;
  readonly open: boolean;
  readonly onClose: () => void;
  /** Why a new change cannot start now, if anything stands in the way. */
  readonly blockedBy: string | null;
}) {
  const t = useTranslations('scopeChanges.form');
  const formId = useId();
  const form = useApiForm();
  const accepted = useQuery({
    queryKey: ['quotation', project.quotation.id],
    queryFn: () =>
      expectStatus(api.quotations.getQuotation({ params: { id: project.quotation.id } }), 200),
    enabled: open && blockedBy === null,
  });
  return (
    <Sheet
      open={open}
      onOpenChange={(next) => !next && onClose()}
      title={t('title')}
      description={t('intro', { number: project.quotation.number })}
      width="lg"
      footer={
        <>
          <Button variant="quiet" onClick={onClose}>
            {t('cancel')}
          </Button>
          {blockedBy === null && (
            <Button type="submit" form={formId} variant="primary" pending={form.pending}>
              {t('raise')}
            </Button>
          )}
        </>
      }
    >
      {blockedBy !== null && (
        <p className="px-5 py-6 type-body text-ink-muted sm:px-6">{blockedBy}</p>
      )}
      {blockedBy === null && accepted.isPending && <Skeleton className="m-6 h-64 rounded-xl" />}
      {blockedBy === null && accepted.isError && (
        <LoadError error={accepted.error} onRetry={() => accepted.refetch()} />
      )}
      {blockedBy === null && accepted.data && (
        <ChangeForm
          project={project}
          accepted={accepted.data}
          formId={formId}
          form={form}
          onRaised={onClose}
        />
      )}
    </Sheet>
  );
}
