'use client';

import type { AuditEntry } from '@oneohm/api-contracts';
import { Badge, Sheet } from '@oneohm/design-system/web';
import { ArrowRight } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { readableAction, viewEntry } from './audit-format';

function Section({ title, children }: { readonly title: string; readonly children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3 border-t border-hairline pt-5 first:border-t-0 first:pt-0">
      <h3 className="type-label font-medium text-ink-faint">{title}</h3>
      {children}
    </section>
  );
}

function Row({ label, children }: { readonly label: string; readonly children: ReactNode }) {
  return (
    <div className="grid grid-cols-[10rem_1fr] items-baseline gap-x-4">
      <dt className="type-body-sm text-ink-faint">{label}</dt>
      <dd className="min-w-0 break-words type-body text-ink">{children}</dd>
    </div>
  );
}

/** Everything recorded about one change, in a drawer. */
export function ChangeSheet({
  entry,
  onClose,
}: {
  readonly entry: AuditEntry | null;
  readonly onClose: () => void;
}) {
  const t = useTranslations('settings.activity');
  const format = useFormatter();
  const view = viewEntry(entry?.data ?? null);
  return (
    <Sheet
      open={entry !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={entry ? readableAction(entry.action) : ''}
      description={
        entry
          ? format.dateTime(new Date(entry.at), { dateStyle: 'medium', timeStyle: 'medium' })
          : undefined
      }
    >
      {entry && (
        <div className="flex flex-col gap-5 px-6 py-5">
          <Section title={t('sheet.summary')}>
            <dl className="flex flex-col gap-2">
              <Row label={t('columns.who')}>{entry.actor?.name ?? t('system')}</Row>
              <Row label={t('columns.record')}>
                <Badge variant="outline">{entry.entity.replace(/_/g, ' ')}</Badge>
              </Row>
              <Row label={t('sheet.recordId')}>
                <span className="select-all font-mono text-[0.8125rem]">{entry.entityId}</span>
              </Row>
              <Row label={t('sheet.entryId')}>
                <span className="select-all font-mono text-[0.8125rem]">{entry.id}</span>
              </Row>
            </dl>
          </Section>
          {view.changes.length > 0 && (
            <Section title={t('sheet.changes')}>
              <ul className="flex flex-col gap-3">
                {view.changes.map((change) => (
                  <li key={change.key} className="flex flex-col gap-1">
                    <span className="type-body-sm text-ink-faint">{change.label}</span>
                    <span className="flex flex-wrap items-center gap-2 type-body text-ink">
                      <span className="text-ink-muted line-through">{change.from}</span>
                      <ArrowRight aria-hidden className="size-4 text-ink-faint" />
                      <span className="font-medium">{change.to}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </Section>
          )}
          <Section title={t('sheet.details')}>
            {view.details.length === 0 ? (
              <p className="type-body-sm text-ink-faint">{t('sheet.noDetails')}</p>
            ) : (
              <dl className="flex flex-col gap-2">
                {view.details.map((row) => (
                  <Row key={row.key} label={row.label}>
                    {row.block ? (
                      <pre className="overflow-x-auto rounded-md bg-sunken p-2 font-mono text-[0.75rem]">
                        {row.value}
                      </pre>
                    ) : (
                      row.value
                    )}
                  </Row>
                ))}
              </dl>
            )}
          </Section>
        </div>
      )}
    </Sheet>
  );
}
