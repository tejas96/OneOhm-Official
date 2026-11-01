import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { DeliveryReportView } from '@/features/reports/delivery/delivery-report';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('businessReports.titles');
  return { title: t('delivery') };
}

export default function DeliveryReportPage() {
  return <DeliveryReportView />;
}
