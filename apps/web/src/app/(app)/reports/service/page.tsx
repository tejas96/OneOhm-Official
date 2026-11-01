import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { ServiceReportView } from '@/features/reports/service/service-report';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('businessReports.titles');
  return { title: t('service') };
}

export default function ServiceReportPage() {
  return <ServiceReportView />;
}
