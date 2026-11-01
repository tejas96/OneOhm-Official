import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { TeamView } from '@/features/team/team-view';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('team');
  return { title: t('title') };
}

export default function TeamPage() {
  return <TeamView />;
}
