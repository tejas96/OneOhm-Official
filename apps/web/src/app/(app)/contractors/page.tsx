import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';
import { ContractorsView } from '@/features/contractors/contractors-view';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('contractors');
  return { title: t('title') };
}

export default function ContractorsPage() {
  return (
    <Suspense>
      <ContractorsView />
    </Suspense>
  );
}
