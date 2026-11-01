import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { ServiceDeskView } from '@/features/service/service-desk-view';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('service');
  return { title: t('title') };
}

export default function ServicePage() {
  return <ServiceDeskView />;
}
