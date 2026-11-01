import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { LeadDetailView } from '@/features/leads/lead-detail-view';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('leads');
  return { title: t('detailTitle') };
}

export default async function LeadPage({ params }: PageProps<'/leads/[id]'>) {
  const { id } = await params;
  return <LeadDetailView id={id} />;
}
