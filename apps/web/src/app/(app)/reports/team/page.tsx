import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { TeamReportView } from '@/features/reports/team/team-report';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('businessReports.titles');
  return { title: t('team') };
}

export default function TeamReportPage() {
  return <TeamReportView />;
}
