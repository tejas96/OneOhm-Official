import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { TodayView } from '@/features/today/today-view';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('today');
  return { title: t('pageTitle') };
}

export default function TodayPage() {
  return <TodayView />;
}
