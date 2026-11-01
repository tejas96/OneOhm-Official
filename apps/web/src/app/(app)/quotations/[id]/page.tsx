import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { QuotationDetailView } from '@/features/quotations/detail/quotation-detail-view';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('quotations.detail');
  return { title: t('pageTitle') };
}

export default async function QuotationPage({
  params,
}: {
  readonly params: Promise<{ readonly id: string }>;
}) {
  const { id } = await params;
  return <QuotationDetailView id={id} />;
}
