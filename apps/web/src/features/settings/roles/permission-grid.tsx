'use client';

import type { Role } from '@oneohm/api-contracts';
import { cn } from '@oneohm/design-system/web';
import type { Capability } from '@oneohm/domain';
import { useTranslations } from 'next-intl';
import { useCan } from '@/providers/current-user';
import { CAPABILITY_GROUPS } from './capability-areas';
import { moveFocusWithArrows } from './grid-keys';
import { asPredicate, orderRolesForGrid } from './grid-model';
import { PermissionCell } from './permission-cell';
import { RoleColumnHeader } from './role-column-header';
import { useScrollEdges } from './use-scroll-edges';
import { cellKey, usePendingCells, useToggleCapability } from './use-toggle-capability';

/** Each permission's row number across all areas, for arrow-key moves. */
const ROW_OF: ReadonlyMap<Capability, number> = new Map(
  CAPABILITY_GROUPS.flatMap((group) => group.capabilities).map((capability, index) => [
    capability,
    index,
  ]),
);

const LINE = 'border-b border-hairline/70';

/**
 * Who can do what: one row per permission, grouped by area, one column per role.
 * The protected role leads with locks. The header row and the permission column
 * stay in place while the grid scrolls inside its own frame, never the page.
 */
export function PermissionGrid({
  roles,
  onOpenRole,
}: {
  readonly roles: readonly Role[];
  readonly onOpenRole: (role: Role) => void;
}) {
  const settingsT = useTranslations('settings');
  const t = useTranslations('settings.roles.grid');
  const editable = useCan('roles.manage');
  const toggle = useToggleCapability();
  const pendingCells = usePendingCells();
  const columns = orderRolesForGrid(roles);
  const [frameRef, edges] = useScrollEdges();

  return (
    <div className="relative isolate overflow-hidden rounded-xl border border-hairline bg-raised shadow-e1 [--col:4.25rem] [--label:9.5rem] sm:[--col:4.75rem] sm:[--label:15rem]">
      <div
        ref={frameRef}
        className={cn(
          'overflow-auto overscroll-x-contain scroll-pt-28 scroll-pl-(--label)',
          'max-h-[calc(100dvh-5.5rem)] md:max-h-[calc(100dvh-4rem)]',
        )}
      >
        <table
          onKeyDown={moveFocusWithArrows}
          className="w-full table-fixed border-separate border-spacing-0"
          style={{ minWidth: `calc(var(--label) + ${columns.length} * var(--col))` }}
        >
          <caption className="sr-only">{t('caption')}</caption>
          <colgroup>
            <col className="w-(--label)" />
            {columns.map((role) => (
              <col key={role.id} />
            ))}
          </colgroup>
          <thead>
            <tr>
              <th
                scope="col"
                className="sticky top-0 left-0 z-30 border-r border-b border-hairline bg-raised px-4 pb-3 text-left align-bottom type-label font-medium text-ink-faint"
              >
                {t('can')}
              </th>
              {columns.map((role) => (
                <th
                  key={role.id}
                  scope="col"
                  className="sticky top-0 z-20 border-b border-hairline bg-raised px-0.5 pt-3 pb-1.5 align-bottom font-normal"
                >
                  <RoleColumnHeader role={role} onOpen={() => onOpenRole(role)} />
                </th>
              ))}
            </tr>
          </thead>
          {CAPABILITY_GROUPS.map((group) => (
            <tbody key={group.area}>
              <tr>
                <th
                  scope="rowgroup"
                  colSpan={columns.length + 1}
                  className={cn(LINE, 'bg-surface p-0 text-left font-normal')}
                >
                  <span className="sticky left-0 inline-block px-4 pt-4 pb-1.5 type-overline text-ink-faint uppercase">
                    {settingsT(`areas.${group.area}`)}
                  </span>
                </th>
              </tr>
              {group.capabilities.map((capability) => {
                const label = settingsT(`capabilities.${capability}`);
                const action = asPredicate(label);
                const row = ROW_OF.get(capability) ?? 0;
                return (
                  <tr key={capability} className="group/row">
                    <th
                      scope="row"
                      className={cn(
                        LINE,
                        'sticky left-0 z-10 border-r border-r-hairline bg-raised px-4 py-1.5 text-left align-middle',
                        'type-body-sm font-normal text-ink group-hover/row:bg-canvas',
                      )}
                    >
                      {label}
                    </th>
                    {columns.map((role, column) => {
                      const held = role.system || role.capabilities.includes(capability);
                      const names = { role: role.name, capability: action };
                      return (
                        <td
                          key={role.id}
                          className={cn(
                            LINE,
                            'px-0.5 py-0.5 text-center group-hover/row:bg-canvas',
                            role.archived && 'opacity-60',
                          )}
                        >
                          <PermissionCell
                            label={role.system ? t('lockedCell', names) : t('cell', names)}
                            held={held}
                            locked={role.system}
                            editable={editable}
                            pending={pendingCells.has(cellKey(role.id, capability))}
                            onToggle={() => toggle.mutate({ role, capability, grant: !held })}
                            row={row}
                            column={column}
                          />
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          ))}
        </table>
      </div>
      <div
        aria-hidden
        className={cn(
          'pointer-events-none absolute inset-y-0 right-0 z-40 w-12 bg-linear-to-l from-raised to-transparent',
          'transition-opacity duration-(--duration-fast)',
          edges.moreAfter ? 'opacity-100' : 'opacity-0',
        )}
      />
    </div>
  );
}
