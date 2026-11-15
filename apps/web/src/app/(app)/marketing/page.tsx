import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';
import { MarketingView } from '@/features/marketing/marketing-view';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('marketing');
  return { title: t('title') };
}

export default function MarketingPage() {
  return (
    <Suspense>
      <MarketingView />
    </Suspense>
  );
}
