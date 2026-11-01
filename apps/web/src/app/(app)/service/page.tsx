import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';
import { ServiceView } from '@/features/service/service-view';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('service');
  return { title: t('title') };
}

export default function ServicePage() {
  return (
    <Suspense>
      <ServiceView />
    </Suspense>
  );
}
