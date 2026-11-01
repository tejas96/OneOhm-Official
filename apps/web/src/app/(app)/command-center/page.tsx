import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { CommandCenterView } from '@/features/command-center/command-center-view';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('commandCenter');
  return { title: t('title') };
}

export default function CommandCenterPage() {
  return <CommandCenterView />;
}
