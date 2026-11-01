'use client';

import { Button, useToast } from '@oneohm/design-system/web';
import { FileArchive, Printer, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { describeError } from '@/lib/api/api-error';
import { downloadBundle } from '@/lib/api/bundle';
import type { DocumentRights } from '../use-document-rights';

/** What to do with the picked files: one ZIP, or one PDF to print. */
export function SelectionBar({
  ids,
  name,
  rights,
  onClear,
}: {
  readonly ids: readonly string[];
  readonly name: string;
  readonly rights: DocumentRights;
  readonly onClear: () => void;
}) {
  const t = useTranslations('documents.gallery.select');
  const toast = useToast();
  const [busy, setBusy] = useState<'zip' | 'pdf' | null>(null);
  const run = async (format: 'zip' | 'pdf') => {
    setBusy(format);
    try {
      await downloadBundle(ids, format, name);
    } catch (error) {
      toast({ tone: 'error', title: t('failed'), description: describeError(error) });
    } finally {
      setBusy(null);
    }
  };
  return (
    <div className="sticky bottom-4 z-10 flex flex-wrap items-center gap-2 rounded-xl border border-hairline bg-raised/95 px-4 py-3 shadow-e3 backdrop-blur">
      <span className="mr-auto type-body-sm font-medium text-ink">
        {t('count', { count: ids.length })}
      </span>
      {rights.download && (
        <Button
          size="sm"
          variant="secondary"
          leadingIcon={<FileArchive />}
          pending={busy === 'zip'}
          disabled={ids.length === 0}
          onClick={() => run('zip')}
        >
          {t('zip')}
        </Button>
      )}
      {(rights.print || rights.download) && (
        <Button
          size="sm"
          variant="secondary"
          leadingIcon={<Printer />}
          pending={busy === 'pdf'}
          disabled={ids.length === 0}
          onClick={() => run('pdf')}
        >
          {t('pdf')}
        </Button>
      )}
      <Button size="sm" variant="quiet" leadingIcon={<X />} onClick={onClear}>
        {t('done')}
      </Button>
    </div>
  );
}
