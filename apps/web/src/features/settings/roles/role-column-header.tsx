'use client';

import type { Role } from '@oneohm/api-contracts';
import { Badge, cn, Tooltip } from '@oneohm/design-system/web';
import { Lock } from 'lucide-react';
import { useTranslations } from 'next-intl';

/** What the role is for, shown on hover or focus of its column header. */
function RoleSummary({ role }: { readonly role: Role }) {
  const t = useTranslations('settings.roles');
  return (
    <span className="flex flex-col gap-1">
      <span>{role.description || t('grid.noDescription')}</span>
      {role.system && <span className="opacity-80">{t('grid.protected')}</span>}
    </span>
  );
}

/**
 * A role's column header: its name, what kind of role it is when not staff, a lock
 * when protected, and how many people hold it. Opens the role editor.
 */
export function RoleColumnHeader({
  role,
  onOpen,
}: {
  readonly role: Role;
  readonly onOpen: () => void;
}) {
  const t = useTranslations('settings.roles');
  return (
    <Tooltip content={<RoleSummary role={role} />} side="bottom">
      <button
        type="button"
        aria-haspopup="dialog"
        onClick={onOpen}
        className={cn(
          'group flex w-full flex-col items-center gap-1 rounded-md px-0.5 py-1.5 text-center',
          'transition-colors duration-(--duration-fast) hover:bg-sunken',
          role.archived && 'opacity-60',
        )}
      >
        {(role.system || role.kind !== 'staff' || role.archived) && (
          <span className="flex flex-wrap justify-center gap-1">
            {role.system && (
              <>
                <Lock aria-hidden className="size-3.5 text-ink-faint" />
                <span className="sr-only">{t('system')}</span>
              </>
            )}
            {role.kind !== 'staff' && (
              <Badge variant="accent" className="h-5 px-1.5">
                {t(`kindsShort.${role.kind}`)}
              </Badge>
            )}
            {role.archived && <Badge className="h-5 px-1.5">{t('archived')}</Badge>}
          </span>
        )}
        <span className="hyphens-auto text-balance break-words type-label font-medium text-ink-muted group-hover:text-ink">
          {role.name}
        </span>
        <span className="type-label font-normal text-ink-faint tabular-nums">
          {t('members', { count: role.memberCount })}
        </span>
      </button>
    </Tooltip>
  );
}
