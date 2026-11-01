import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { ProjectsListView } from '@/features/projects/projects-list-view';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('projects.list');
  return { title: t('title') };
}

export default function ProjectsPage() {
  return <ProjectsListView />;
}
