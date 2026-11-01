import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';
import { DiscomView } from '@/features/discom/discom-view';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('discom');
  return { title: t('title') };
}

export default function DiscomPage() {
  return (
    <Suspense>
      <DiscomView />
    </Suspense>
  );
}
