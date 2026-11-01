'use client';

import type { ReportStatus } from '@oneohm/api-contracts';
import { Button, Sheet } from '@oneohm/design-system/web';
import { factField } from '@oneohm/domain';
import { useTranslations } from 'next-intl';
import { type FormEvent, useId, useState } from 'react';
import { FormError } from '@/components/form-error';
import { ApiError, describeError } from '@/lib/api/api-error';
import { FactFields } from '../../tasks/fact-fields';

/** Project facts are snake_case keys; company details (camelCase) live in Settings. */
export const isProjectFact = (field: string) => /^[a-z][a-z0-9_]*$/.test(field);

interface FactsMutation {
  readonly isPending: boolean;
  readonly mutateAsync: (facts: Record<string, string>) => Promise<unknown>;
}

/**
 * Fills the details a report still needs (PRD 3.18), for when the task that records them
 * finished before it asked for them. Company details are set in Settings → Company.
 */
export function ReportFactsSheet({
  report,
  onClose,
  mutation,
}: {
  readonly report: ReportStatus | null;
  readonly onClose: () => void;
  readonly mutation: FactsMutation;
}) {
  const t = useTranslations('projects.reports.fill');
  const formId = useId();
  const [values, setValues] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Readonly<Record<string, string>>>({});
  const fields = (report?.missing ?? [])
    .filter((item) => isProjectFact(item.field))
    .map((item) => factField(item.field));
  const close = () => {
    setValues({});
    setError(null);
    setFieldErrors({});
    onClose();
  };
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setFieldErrors({});
    const filled = Object.fromEntries(
      Object.entries(values).filter(([, value]) => value.trim() !== ''),
    );
    if (Object.keys(filled).length === 0) {
      setError(t('empty'));
      return;
    }
    try {
      await mutation.mutateAsync(filled);
      close();
    } catch (caught) {
      setError(describeError(caught));
      if (caught instanceof ApiError) setFieldErrors(caught.fieldErrors);
    }
  };
  return (
    <Sheet
      open={report !== null}
      onOpenChange={(open) => !open && close()}
      title={t('title', { name: report?.name ?? '' })}
      description={t('description')}
      autoFocusField
      footer={
        <Button type="submit" form={formId} variant="primary" pending={mutation.isPending}>
          {t('save')}
        </Button>
      }
    >
      <form
        id={formId}
        onSubmit={submit}
        noValidate
        className="flex flex-col gap-5 px-5 py-6 sm:px-6"
      >
        <FactFields
          fields={fields}
          values={values}
          errors={fieldErrors}
          onChange={(key, value) => setValues((current) => ({ ...current, [key]: value }))}
        />
        <p className="type-body-sm text-ink-muted">{t('audit')}</p>
        <FormError message={error} />
      </form>
    </Sheet>
  );
}
