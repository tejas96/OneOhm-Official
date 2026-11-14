'use client';

import type { ChatFile, ChatForm } from '@oneohm/api-contracts';
import { ClipboardList, ExternalLink, FileText } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { documentThumbUrl, documentUrl } from '@/lib/api/upload';
import { formLinkTarget } from './message-chips';

/** A photo as a small square that opens the full file; any other file as a chip. */
function FormFileItem({ file }: { readonly file: ChatFile }) {
  const url = documentUrl(file.id);
  if (file.contentType.startsWith('image/'))
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener"
        className="block size-20 shrink-0 overflow-hidden rounded-lg border border-hairline"
      >
        {/* biome-ignore lint/performance/noImgElement: a stored file streamed by the API */}
        <img src={documentThumbUrl(file.id)} alt={file.name} className="size-full object-cover" />
      </a>
    );
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener"
      className="inline-flex max-w-full items-center gap-1.5 rounded-lg border border-hairline px-2.5 py-1.5 type-label text-accent"
    >
      <FileText aria-hidden className="size-4 shrink-0" />
      <span className="truncate">{file.name}</span>
    </a>
  );
}

/** What a customer filled in a WhatsApp form: its answers and files, in one card. */
export function FormCard({ form }: { readonly form: NonNullable<ChatForm> }) {
  const t = useTranslations('service.whatsapp.form');
  const target = form.link ? formLinkTarget(form.link) : null;
  return (
    <section aria-label={form.title} className="flex min-w-0 flex-col gap-2.5 whitespace-normal">
      <header className="flex items-center gap-2">
        <ClipboardList aria-hidden className="size-4 shrink-0 text-accent" />
        <h3 className="min-w-0 flex-1 truncate type-body font-medium text-ink">{form.title}</h3>
        <span className="type-label text-ink-faint">{t('label')}</span>
      </header>
      {form.rows.length > 0 && (
        <dl className="grid grid-cols-[minmax(4.5rem,auto)_1fr] gap-x-3 gap-y-1">
          {form.rows.map((row) => (
            <div key={`${row.label}:${row.value}`} className="contents">
              <dt className="type-label text-ink-faint">{row.label}</dt>
              <dd className="type-body text-ink [overflow-wrap:anywhere]">{row.value}</dd>
            </div>
          ))}
        </dl>
      )}
      {form.files.length > 0 && (
        <ul aria-label={t('files', { count: form.files.length })} className="flex flex-wrap gap-2">
          {form.files.map((file) => (
            <li key={file.id} className="min-w-0">
              <FormFileItem file={file} />
            </li>
          ))}
        </ul>
      )}
      {target && (
        <Link
          href={target.href}
          className="inline-flex items-center gap-1 self-start type-label text-accent underline underline-offset-2"
        >
          {t(target.label)}
          <ExternalLink aria-hidden className="size-3.5" />
        </Link>
      )}
    </section>
  );
}
