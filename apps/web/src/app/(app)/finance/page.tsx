import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';
import { FinanceView } from '@/features/finance/finance-view';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('finance');
  return { title: t('title') };
}

export default function FinancePage() {
  return (
    <Suspense>
      <FinanceView />
    </Suspense>
  );
}
