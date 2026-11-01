import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { ProfitabilityReportView } from '@/features/reports/profitability/profitability-report';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('businessReports.titles');
  return { title: t('profitability') };
}

export default function ProfitabilityReportPage() {
  return <ProfitabilityReportView />;
}
