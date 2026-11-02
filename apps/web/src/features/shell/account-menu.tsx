'use client';

import { Avatar, cn, Popover } from '@oneohm/design-system/web';
import { ChevronsUpDown, LogOut } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { api } from '@/lib/api/api-client';
import { useCurrentUser } from '@/providers/current-user';

/** Who is signed in, with sign out. */
export function AccountMenu({ compact = false }: { readonly compact?: boolean }) {
  const t = useTranslations('nav.account');
  const user = useCurrentUser();
  const [busy, setBusy] = useState(false);
  const role = user.roles.map((entry) => entry.name).join(', ') || t('noRole');

  const signOut = async () => {
    setBusy(true);
    try {
      await api.auth.signOut();
    } finally {
      window.location.assign('/sign-in');
    }
  };

  return (
    <Popover
      label={t('label')}
      tooltip={compact ? `${user.fullName} · ${role}` : undefined}
      side="top"
      align="start"
      trigger={
        <button
          type="button"
          className={cn(
            'flex w-full items-center gap-3 rounded-lg p-2 text-left transition-colors hover:bg-sunken',
            compact && 'justify-center',
          )}
        >
          <Avatar name={user.fullName} swatch={1} size="sm" />
          {!compact && (
            <>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate type-body-sm font-medium text-ink">{user.fullName}</span>
                <span className="truncate type-label text-ink-faint">{role}</span>
              </span>
              <ChevronsUpDown aria-hidden className="size-4 text-ink-faint" />
            </>
          )}
        </button>
      }
    >
      <div className="-m-2 flex w-56 flex-col gap-1">
        <p className="truncate px-2 py-1.5 type-label text-ink-faint">{user.email ?? user.phone}</p>
        <button
          type="button"
          disabled={busy}
          onClick={signOut}
          className="flex items-center gap-2 rounded-md px-2 py-2 type-body-sm text-ink hover:bg-sunken"
        >
          <LogOut aria-hidden className="size-4" />
          {t('signOut')}
        </button>
      </div>
    </Popover>
  );
}
