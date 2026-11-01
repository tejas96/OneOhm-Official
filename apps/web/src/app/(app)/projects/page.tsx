import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';
import { ProjectsListView } from '@/features/projects/projects-list-view';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('projects.list');
  return { title: t('title') };
}

/** Filters and the Cards / Table choice live in the URL, so the view reads search params. */
export default function ProjectsPage() {
  return (
    <Suspense>
      <ProjectsListView />
    </Suspense>
  );
}
