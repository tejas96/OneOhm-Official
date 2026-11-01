import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';
import { LeadsView } from '@/features/leads/leads-view';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('leads');
  return { title: t('title') };
}

export default function LeadsPage() {
  return (
    <Suspense>
      <LeadsView />
    </Suspense>
  );
}
