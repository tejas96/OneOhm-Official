'use client';

import { REPORT_KEYS, type ReportKey } from '@oneohm/api-contracts';
import { Checkbox, Field } from '@oneohm/design-system/web';
import { useTranslations } from 'next-intl';

/**
 * The statutory reports this task makes (PRD 3.18 triggers): each is saved to the
 * project documents once the task is done and its details are complete.
 */
export function TaskReportsPick({
  value,
  onChange,
  error,
}: {
  readonly value: readonly string[];
  readonly onChange: (reports: string[]) => void;
  readonly error?: string | undefined;
}) {
  const t = useTranslations('settings.taskTemplates.sheet');
  const reportT = useTranslations('reports.short');
  const toggle = (key: ReportKey, on: boolean) =>
    onChange(on ? [...value, key] : value.filter((item) => item !== key));
  return (
    <Field label={t('reports')} hint={t('reportsHint')} error={error}>
      <div className="grid gap-x-5 sm:grid-cols-2">
        {REPORT_KEYS.map((key) => (
          <Checkbox
            key={key}
            checked={value.includes(key)}
            label={reportT(key)}
            onCheckedChange={(on) => toggle(key, on)}
          />
        ))}
      </div>
    </Field>
  );
}
