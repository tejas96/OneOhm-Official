import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { ContractorDetailView } from '@/features/contractors/contractor-detail-view';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('contractors');
  return { title: t('detailTitle') };
}

export default async function ContractorPage({ params }: PageProps<'/contractors/[id]'>) {
  const { id } = await params;
  return <ContractorDetailView id={id} />;
}
