import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';
import { TaskBoardView } from '@/features/command-center/tasks/task-board-view';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('commandCenter.taskBoard');
  return { title: t('pageTitle') };
}

export default function TaskBoardPage() {
  return (
    <Suspense>
      <TaskBoardView />
    </Suspense>
  );
}
