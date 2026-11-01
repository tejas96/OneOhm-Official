'use client';

import type { ProjectDetail } from '@oneohm/api-contracts';
import { TabPanel, Tabs } from '@oneohm/design-system/web';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { DocumentChecklistCard } from '@/features/documents/document-checklist-card';
import { DocumentsGallery } from '@/features/documents/gallery/documents-gallery';
import { ProjectMaterialCard } from '@/features/inventory/material/project-material-card';
import { ActivityTimeline } from './activity-timeline';
import { OverviewTab } from './overview/overview-tab';
import { PaymentsTab } from './payments-tab';
import { ReportReadiness } from './report-readiness';
import type { ProjectSignals } from './room-signals';
import { TasksTab } from './tasks-tab';
import { ROOM_TABS, type RoomTab, useRoomTab } from './use-room-tab';

/** The room's sections, one at a time; the open one is `?tab=` in the URL. */
export function RoomTabs({
  project,
  signals,
}: {
  readonly project: ProjectDetail;
  readonly signals: ProjectSignals;
}) {
  const t = useTranslations('projects.room.tabs');
  const { tab, select } = useRoomTab();
  const counts: Partial<Record<RoomTab, number>> = { tasks: signals.open.length };

  const panel = (value: RoomTab): ReactNode => {
    switch (value) {
      case 'overview':
        return <OverviewTab project={project} signals={signals} />;
      case 'tasks':
        return <TasksTab project={project} signals={signals} />;
      case 'payments':
        return <PaymentsTab project={project} />;
      case 'material':
        return (
          <div className="max-w-4xl">
            <ProjectMaterialCard projectId={project.id} />
          </div>
        );
      case 'documents':
        return (
          <div className="flex flex-col gap-8">
            <DocumentChecklistCard projectId={project.id} />
            <DocumentsGallery scope={{ projectId: project.id }} bundleName={project.code} />
          </div>
        );
      case 'reports':
        return (
          <div className="max-w-4xl">
            <ReportReadiness projectId={project.id} reports={project.reports} />
          </div>
        );
      case 'activity':
        return (
          <div className="max-w-3xl">
            <ActivityTimeline activities={project.activities} />
          </div>
        );
    }
  };

  return (
    <Tabs
      value={tab}
      onValueChange={select}
      label={t('label')}
      items={ROOM_TABS.map((value) => {
        const count = counts[value];
        return { value, label: t(value), ...(count === undefined ? {} : { count }) };
      })}
      className="min-w-0"
    >
      {ROOM_TABS.map((value) => (
        <TabPanel key={value} value={value} className="min-w-0 pt-6 outline-none">
          {value === tab && panel(value)}
        </TabPanel>
      ))}
    </Tabs>
  );
}
