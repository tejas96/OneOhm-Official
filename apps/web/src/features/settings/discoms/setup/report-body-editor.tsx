'use client';

import type { ReportFormatCheck } from '@oneohm/api-contracts';
import { Button, Field, Textarea } from '@oneohm/design-system/web';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { FormError } from '@/components/form-error';
import { api, expectStatus } from '@/lib/api/api-client';
import { useApiForm } from '@/lib/forms/use-api-form';

/**
 * Replace a format's template: paste the new body, check it (unknown details are
 * refused, what it prints is listed), then save.
 */
export function ReportBodyEditor({
  formatId,
  onSave,
  onCancel,
}: {
  readonly formatId: string;
  readonly onSave: (body: string) => Promise<void>;
  readonly onCancel: () => void;
}) {
  const t = useTranslations('discomSetup');
  const form = useApiForm();
  const current = useQuery({
    queryKey: ['settings', 'report-format-body', formatId],
    queryFn: () =>
      expectStatus(api.reportFormats.reportFormatBody({ params: { id: formatId } }), 200),
  });
  const [body, setBody] = useState('');
  const [checked, setChecked] = useState<ReportFormatCheck | null>(null);
  useEffect(() => {
    if (current.data) setBody(current.data.body);
  }, [current.data]);

  const check = async () => {
    const result = await form.run(() =>
      expectStatus(api.reportFormats.checkReportFormat({ body: { body } }), 200),
    );
    setChecked(result ?? null);
  };

  return (
    <div className="flex flex-col gap-3 rounded-xl bg-sunken/40 p-4">
      <Field
        label={t('formats.sheet.template')}
        hint={t('formats.sheet.intro')}
        error={form.fieldErrors.body}
      >
        <Textarea
          rows={10}
          value={body}
          className="font-mono text-[0.75rem]"
          onChange={(event) => {
            setBody(event.target.value);
            setChecked(null);
          }}
        />
      </Field>
      {checked && (
        <p className="type-body-sm text-ink-muted">
          {t('formats.sheet.needs')}:{' '}
          {checked.requires.length
            ? checked.requires.map((item) => item.label).join(', ')
            : t('formats.sheet.needsNone')}
        </p>
      )}
      <FormError message={form.error} />
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" size="sm" pending={form.pending} onClick={() => void check()}>
          {t('formats.sheet.check')}
        </Button>
        {current.data?.builtIn && current.data.builtIn !== body && (
          <Button
            variant="quiet"
            size="sm"
            onClick={() => {
              setBody(current.data?.builtIn ?? '');
              setChecked(null);
            }}
          >
            {t('formats.sheet.restore')}
          </Button>
        )}
        <Button variant="quiet" size="sm" onClick={onCancel}>
          {t('cancel')}
        </Button>
        <Button
          variant="primary"
          size="sm"
          disabled={!checked || checked.html === null}
          onClick={() => void onSave(body)}
        >
          {t('save')}
        </Button>
      </div>
      {!checked && <p className="type-body-sm text-ink-faint">{t('formats.sheet.checkFirst')}</p>}
    </div>
  );
}
