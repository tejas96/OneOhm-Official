import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';
import { VisitsView } from '@/features/visits/visits-view';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('visits');
  return { title: t('page.title') };
}

export default function VisitsPage() {
  return (
    <Suspense>
      <VisitsView />
    </Suspense>
  );
}
