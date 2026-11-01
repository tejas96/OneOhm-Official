'use client';

import type { OrderDcrPapers } from '@oneohm/api-contracts';
import { Button, useToast } from '@oneohm/design-system/web';
import { FileCheck2, Upload } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRef, useState } from 'react';
import { describeError } from '@/lib/api/api-error';
import { documentUrl, uploadDcrCertificate } from '@/lib/api/upload';
import { useCan } from '@/providers/current-user';
import { useRefreshOrderDcr } from './use-order-dcr';

type ReceiptPapers = OrderDcrPapers['receipts'][number];

/**
 * A receipt's DCR papers: who made the cells and on which invoice, and the panel
 * maker's certificate (open it, or add one if the store has it now).
 */
export function ReceiptDcr({
  orderId,
  papers,
}: {
  readonly orderId: string;
  readonly papers: ReceiptPapers | undefined;
}) {
  const t = useTranslations('inventory.dcr');
  const toast = useToast();
  const refresh = useRefreshOrderDcr();
  const canAttach = useCan('inventory.manage', 'procurement.manage');
  const input = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  if (!papers || papers.cells.length === 0) return null;

  const attach = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    try {
      await uploadDcrCertificate(papers.receiptId, file);
      await refresh(orderId);
      toast({ tone: 'success', title: t('attached') });
    } catch (error) {
      toast({ tone: 'error', title: t('failed'), description: describeError(error) });
    } finally {
      setUploading(false);
      if (input.current) input.current.value = '';
    }
  };

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-hairline px-3 py-2.5">
      {papers.cells.map((cell) => (
        <p key={cell.description} className="type-body-sm text-ink-muted">
          {t('cells', {
            item: cell.description,
            maker: cell.cellManufacturer ?? t('notRecorded'),
            invoice: cell.cellInvoiceNumber ?? t('notRecorded'),
          })}
        </p>
      ))}
      <div className="flex flex-wrap items-center gap-2">
        {papers.certificate ? (
          <a
            href={documentUrl(papers.certificate.documentId)}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-w-0 items-center gap-1.5 type-body-sm font-medium text-ink underline-offset-4 hover:underline"
          >
            <FileCheck2 aria-hidden className="size-4 shrink-0 text-on-track" />
            <span className="truncate">{t('certificate')}</span>
          </a>
        ) : (
          <span className="type-body-sm text-ink-faint">{t('noCertificate')}</span>
        )}
        {canAttach && (
          <>
            <input
              ref={input}
              type="file"
              accept="application/pdf,image/jpeg,image/png,image/webp,image/heic"
              className="sr-only"
              aria-label={t('attachLabel', { number: papers.number })}
              onChange={(event) => attach(event.target.files?.[0])}
            />
            <Button
              size="sm"
              variant="quiet"
              leadingIcon={<Upload />}
              pending={uploading}
              onClick={() => input.current?.click()}
            >
              {papers.certificate ? t('replace') : t('attach')}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
