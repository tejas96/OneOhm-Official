'use client';

import type { ServiceTicket } from '@oneohm/api-contracts';
import { useTranslations } from 'next-intl';
import { DocumentThumb } from '@/features/documents/document-thumb';
import { documentUrl } from '@/lib/api/upload';

/**
 * What the customer added when raising the request (PRD 5.5): photos open full size in a
 * new tab, the short video plays from its first frame, the voice note plays in its tile.
 */
export function TicketCustomerFiles({ ticket }: { readonly ticket: ServiceTicket }) {
  const t = useTranslations('service.sheet');
  if (ticket.photos.length === 0 && ticket.media.length === 0) return null;
  return (
    <section className="flex flex-col gap-3 border-t border-hairline pt-5">
      <h3 className="type-overline text-ink-faint uppercase">
        {ticket.media.length > 0 ? t('fromCustomer') : t('photosTitle')}
      </h3>
      <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {ticket.photos.map((photo) => (
          <li key={photo.id}>
            <a
              href={documentUrl(photo.id)}
              target="_blank"
              rel="noopener"
              className="block aspect-square overflow-hidden rounded-xl ring-1 ring-hairline hover:ring-accent"
            >
              {/* biome-ignore lint/performance/noImgElement: streamed from the API after its access check, not Next's image loader. */}
              <img
                src={documentUrl(photo.id)}
                alt={photo.name}
                className="size-full object-cover"
                loading="lazy"
              />
            </a>
          </li>
        ))}
        {ticket.media.map((file) => (
          <DocumentThumb key={file.id} file={file} />
        ))}
      </ul>
    </section>
  );
}
