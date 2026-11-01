'use client';

import { useTranslations } from 'next-intl';
import { SectionHeading } from '@/features/command-center/section-heading';
import { DocumentsGallery } from './gallery/documents-gallery';

/** The customer's documents across every site and project (PRD 3.2, 3.14). */
export function CustomerDocumentsSection({
  customerId,
  index,
}: {
  readonly customerId: string;
  readonly index: string;
}) {
  const t = useTranslations('documents');
  return (
    <section aria-label={t('title')} className="flex flex-col gap-5">
      <SectionHeading index={index} title={t('title')} />
      <DocumentsGallery scope={{ customerId }} />
    </section>
  );
}
