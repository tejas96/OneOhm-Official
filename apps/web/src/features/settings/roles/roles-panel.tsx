'use client';

import type { Role } from '@oneohm/api-contracts';
import { Button, SegmentedControl, Switch } from '@oneohm/design-system/web';
import { Grid3x3, LayoutGrid, Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { ListSkeleton, LoadError } from '@/components/query-state';
import { useRoles } from '@/features/team/use-team';
import { PermissionGrid } from './permission-grid';
import { RoleCards } from './role-cards';
import { RoleEditorSheet } from './role-editor-sheet';

type RolesView = 'grid' | 'cards';
const VIEWS: readonly RolesView[] = ['grid', 'cards'];

/**
 * Roles and what they can do. The permission grid is the default view; the cards
 * read each role on its own (what it is for, who holds it).
 */
export function RolesPanel() {
  const t = useTranslations('settings.roles');
  const roles = useRoles();
  const [view, setView] = useState<RolesView>('grid');
  const [showArchived, setShowArchived] = useState(false);
  const [editing, setEditing] = useState<Role | null>(null);
  const [creating, setCreating] = useState(false);

  const archivedCount = roles.data?.filter((role) => role.archived).length ?? 0;
  const visible = (roles.data ?? []).filter((role) => showArchived || !role.archived);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <p className="max-w-2xl type-body text-ink-muted">{t('intro')}</p>
        <div className="flex flex-wrap items-center gap-3">
          <SegmentedControl
            value={view}
            onValueChange={setView}
            label={t('views.label')}
            size="sm"
            options={VIEWS.map((value) => ({
              value,
              label: t(`views.${value}`),
              icon: value === 'grid' ? <Grid3x3 aria-hidden /> : <LayoutGrid aria-hidden />,
            }))}
          />
          <Button variant="primary" leadingIcon={<Plus />} onClick={() => setCreating(true)}>
            {t('add')}
          </Button>
        </div>
      </div>
      {roles.isPending && <ListSkeleton label={t('loading')} rows={6} />}
      {roles.isError && <LoadError error={roles.error} onRetry={() => roles.refetch()} />}
      {visible.length > 0 &&
        (view === 'grid' ? (
          <PermissionGrid roles={visible} onOpenRole={setEditing} />
        ) : (
          <RoleCards roles={visible} onOpenRole={setEditing} />
        ))}
      {archivedCount > 0 && (
        <Switch
          checked={showArchived}
          onCheckedChange={setShowArchived}
          label={t('showArchived')}
          className="max-w-sm"
        />
      )}
      <RoleEditorSheet
        open={creating || editing !== null}
        role={editing}
        onClose={() => {
          setCreating(false);
          setEditing(null);
        }}
      />
    </div>
  );
}
