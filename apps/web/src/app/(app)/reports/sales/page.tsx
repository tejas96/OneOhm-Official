import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { SalesReportView } from '@/features/reports/sales/sales-report';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('businessReports.titles');
  return { title: t('sales') };
}

export default function SalesReportPage() {
  return <SalesReportView />;
}
