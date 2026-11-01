import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { CollectionsReportView } from '@/features/reports/collections/collections-report';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('businessReports.titles');
  return { title: t('collections') };
}

export default function CollectionsReportPage() {
  return <CollectionsReportView />;
}
