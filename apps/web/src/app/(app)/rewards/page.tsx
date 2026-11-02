import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { MyRewardsView } from '@/features/rewards/my-rewards-view';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('rewards');
  return { title: t('pageTitle') };
}

export default function RewardsPage() {
  return <MyRewardsView />;
}
