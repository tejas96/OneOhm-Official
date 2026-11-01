import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { DelaysReportView } from '@/features/reports/delays/delays-report';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('businessReports.titles');
  return { title: t('delays') };
}

export default function DelaysReportPage() {
  return <DelaysReportView />;
}
