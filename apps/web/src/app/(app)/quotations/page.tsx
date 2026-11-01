import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { QuotationsList } from '@/features/quotations/quotations-list';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('quotations.list');
  return { title: t('title') };
}

export default function QuotationsPage() {
  return <QuotationsList />;
}
