'use client';

import type { Discom, ReportFormat } from '@oneohm/api-contracts';
import { Button, Switch, useToast } from '@oneohm/design-system/web';
import { FileText } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { ListSkeleton, LoadError } from '@/components/query-state';
import { api, expectStatus } from '@/lib/api/api-client';
import { describeError } from '@/lib/api/api-error';
import { ReportBodyEditor } from './report-body-editor';
import { useReportFormats, useSaveReportFormat } from './use-discom-setup';

/** One DISCOM's report formats: on/off, who sees them, and their templates (PRD 3.18). */
export function ReportFormatsSection({ discom }: { readonly discom: Discom }) {
  const t = useTranslations('discomSetup');
  const toast = useToast();
  const formats = useReportFormats(discom.id);
  const save = useSaveReportFormat(discom.id);
  const [editing, setEditing] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const change = async (
    format: ReportFormat,
    patch: { active?: boolean; customerVisible?: boolean; body?: string },
  ) => {
    setBusy(format.id);
    try {
      const body = patch.body ?? (await bodyOf(format.id));
      const {
        id: _id,
        discomId: _d,
        key: _k,
        source: _s,
        requires: _r,
        triggers: _t,
        updatedAt: _u,
        ...rest
      } = format;
      const saved = await save(format.id, { ...rest, ...patch, body });
      toast({ tone: 'success', title: t('saved', { name: saved.name }) });
      return true;
    } catch (error) {
      toast({ tone: 'error', title: t('failed'), description: describeError(error) });
      return false;
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="type-display-md text-ink">{t('formats.title')}</h2>
        <p className="max-w-2xl type-body text-ink-muted">{t('formats.intro')}</p>
      </div>
      {formats.isPending && <ListSkeleton label={t('formats.loading')} rows={4} />}
      {formats.isError && <LoadError error={formats.error} onRetry={() => formats.refetch()} />}
      {formats.data && (
        <ul className="flex flex-col divide-y divide-hairline rounded-xl border border-hairline">
          {formats.data.map((format) => (
            <li key={format.id} className="flex flex-col gap-3 px-4 py-4">
              <div className="flex flex-col gap-1">
                <span className="type-body font-medium text-ink">{format.name}</span>
                <span className="type-body-sm text-ink-faint">
                  {t('formats.columns.when')}:{' '}
                  {format.triggers.length
                    ? t('formats.afterTasks', { tasks: format.triggers.join(', ') })
                    : t('formats.atSetUp')}
                  {format.onlyWithSubsidy && ` · ${t('formats.onlySubsidy')}`}
                  {` · ${format.source === 'uploaded' ? t('formats.own') : t('formats.oneohm')}`}
                </span>
              </div>
              <div className="grid gap-x-6 sm:grid-cols-2">
                <Switch
                  checked={format.active}
                  disabled={busy === format.id}
                  onCheckedChange={(active) => void change(format, { active })}
                  label={t('formats.sheet.active', { discom: discom.code })}
                />
                <Switch
                  checked={format.customerVisible}
                  disabled={busy === format.id}
                  onCheckedChange={(customerVisible) => void change(format, { customerVisible })}
                  label={t('formats.sheet.customerVisible')}
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setEditing(editing === format.id ? null : format.id)}
                >
                  {t('formats.sheet.replace')}
                </Button>
                <a
                  href={`/api/v1/report-formats/${format.id}/sample.pdf`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 px-2 type-body-sm text-ink-muted hover:text-ink"
                >
                  <FileText aria-hidden className="size-4" />
                  {t('formats.sheet.samplePdf')}
                </a>
              </div>
              {editing === format.id && (
                <ReportBodyEditor
                  formatId={format.id}
                  onSave={async (body) => {
                    if (await change(format, { body })) setEditing(null);
                  }}
                  onCancel={() => setEditing(null)}
                />
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

async function bodyOf(id: string): Promise<string> {
  const result = await expectStatus(api.reportFormats.reportFormatBody({ params: { id } }), 200);
  return result.body;
}
