import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';
import { InventoryView } from '@/features/inventory/inventory-view';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('inventory');
  return { title: t('title') };
}

export default function InventoryPage() {
  return (
    <Suspense>
      <InventoryView />
    </Suspense>
  );
}
