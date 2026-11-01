import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';
import { QuotationBuilder } from '@/features/quotations/builder/quotation-builder';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('quotations.builder');
  return { title: t('title') };
}

/** `?propertyId=`, `?leadId=` or `?from=<quotation>` start the builder pre-filled. */
export default function NewQuotationPage() {
  return (
    <Suspense>
      <QuotationBuilder />
    </Suspense>
  );
}
