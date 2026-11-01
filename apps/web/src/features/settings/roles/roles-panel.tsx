'use client';

import type { Role } from '@oneohm/api-contracts';
import { Badge, Button, cn, listItemEnter, Switch } from '@oneohm/design-system/web';
import { CAPABILITIES } from '@oneohm/domain';
import { ChevronRight, Plus, ShieldCheck } from 'lucide-react';
import { motion } from 'motion/react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { ListSkeleton, LoadError } from '@/components/query-state';
import { useRoles } from '@/features/team/use-team';
import { RoleEditorSheet } from './role-editor-sheet';

/** Every role as a card: who it is for, how many hold it, how much it can do. */
export function RolesPanel() {
  const t = useTranslations('settings.roles');
  const roles = useRoles();
  const [showArchived, setShowArchived] = useState(false);
  const [editing, setEditing] = useState<Role | null>(null);
  const [creating, setCreating] = useState(false);

  const archivedCount = roles.data?.filter((role) => role.archived).length ?? 0;
  const visible = (roles.data ?? []).filter((role) => showArchived || !role.archived);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <p className="max-w-2xl type-body text-ink-muted">{t('intro')}</p>
        <Button variant="primary" leadingIcon={<Plus />} onClick={() => setCreating(true)}>
          {t('add')}
        </Button>
      </div>
      {roles.isPending && <ListSkeleton label={t('loading')} rows={4} />}
      {roles.isError && <LoadError error={roles.error} onRetry={() => roles.refetch()} />}
      {visible.length > 0 && (
        <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {visible.map((role, index) => (
            <motion.li key={role.id} {...listItemEnter(index)}>
              <RoleCard role={role} onOpen={() => setEditing(role)} />
            </motion.li>
          ))}
        </ul>
      )}
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

function RoleCard({ role, onOpen }: { readonly role: Role; readonly onOpen: () => void }) {
  const t = useTranslations('settings.roles');
  const share = role.capabilities.length / CAPABILITIES.length;
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        'group flex h-full w-full flex-col gap-4 rounded-2xl bg-raised p-5 text-left shadow-e1 ring-1 ring-hairline/70',
        'transition-[box-shadow,transform] duration-(--duration-fast) hover:-translate-y-0.5 hover:shadow-e2',
        role.archived && 'opacity-60',
      )}
    >
      <span className="flex items-start justify-between gap-3">
        <span className="flex min-w-0 flex-col gap-1">
          <span className="truncate type-title-lg font-normal text-ink [font-family:var(--font-display)]">
            {role.name}
          </span>
          <span className="flex flex-wrap gap-1.5">
            <Badge variant={role.kind === 'staff' ? 'soft' : 'accent'}>
              {t(`kinds.${role.kind}`)}
            </Badge>
            {role.system && (
              <Badge variant="energy">
                <ShieldCheck aria-hidden className="size-3.5" />
                {t('system')}
              </Badge>
            )}
            {role.archived && <Badge>{t('archived')}</Badge>}
          </span>
        </span>
        <ChevronRight
          aria-hidden
          className="size-4 shrink-0 text-ink-faint transition-transform group-hover:translate-x-0.5"
        />
      </span>
      {role.description && (
        <span className="line-clamp-2 type-body-sm text-ink-muted">{role.description}</span>
      )}
      <span className="mt-auto flex flex-col gap-2">
        <span className="h-1.5 overflow-hidden rounded-full bg-sunken">
          <span
            className="block h-full rounded-full bg-accent"
            style={{ width: `${Math.round(share * 100)}%` }}
          />
        </span>
        <span className="flex justify-between type-label text-ink-faint">
          <span>{t('permissions', { count: role.capabilities.length })}</span>
          <span>{t('members', { count: role.memberCount })}</span>
        </span>
      </span>
    </button>
  );
}
