'use client';

import type { Person } from '@oneohm/api-contracts';
import { IconButton, Popover, StatusPill, useToast } from '@oneohm/design-system/web';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Copy, Ellipsis, Send } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { api, expectStatus } from '@/lib/api/api-client';
import { describeError } from '@/lib/api/api-error';
import { PEOPLE_KEY } from './use-team';

/** Whether a current member still has to accept their invite: they have never signed in. */
export const awaitsSignIn = (person: Person) =>
  person.status === 'active' && person.invite === 'not_signed_in';

/** "Invited, not signed in yet" or "Invite not delivered", until their first sign-in. */
export function InviteBadge({ person }: { readonly person: Person }) {
  const t = useTranslations('team.invite');
  if (!awaitsSignIn(person)) return null;
  return person.inviteDelivery === 'failed' ? (
    <StatusPill tone="overdue" label={t('notDelivered')} size="sm" />
  ) : (
    <StatusPill tone="waiting" label={t('notSignedIn')} size="sm" />
  );
}

/** The row menu for someone who has not signed in yet: send the invite again or copy it. */
export function InviteMenu({ person }: { readonly person: Person }) {
  const t = useTranslations('team.invite');
  const toast = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const resend = useMutation({
    mutationFn: () => expectStatus(api.people.invitePerson({ params: { id: person.id } }), 202),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: PEOPLE_KEY });
      toast({ title: t('sent'), reference: person.fullName, tone: 'success' });
    },
    onError: (error) => toast({ title: describeError(error), tone: 'error' }),
  });

  if (!awaitsSignIn(person)) return null;
  const inviteText = person.inviteText;

  const copy = (text: string) =>
    navigator.clipboard.writeText(text).then(
      () => toast({ title: t('copied'), tone: 'success' }),
      () => toast({ title: t('copyFailed'), tone: 'error' }),
    );

  const items = [
    { key: 'sendAgain', icon: Send, run: () => resend.mutate() },
    ...(inviteText ? [{ key: 'copyText', icon: Copy, run: () => void copy(inviteText) }] : []),
  ] as const;

  return (
    <Popover
      label={t('menu', { name: person.fullName })}
      open={open}
      onOpenChange={setOpen}
      align="end"
      className="p-1"
      trigger={
        <IconButton
          label={t('menu', { name: person.fullName })}
          size="sm"
          variant="quiet"
          disabled={resend.isPending}
          className="relative z-[2]"
        >
          <Ellipsis aria-hidden />
        </IconButton>
      }
    >
      <ul className="flex min-w-52 flex-col">
        {items.map((item) => (
          <li key={item.key}>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                item.run();
              }}
              className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left type-body-sm text-ink hover:bg-sunken"
            >
              <item.icon aria-hidden className="size-4 text-ink-faint" />
              {t(item.key)}
            </button>
          </li>
        ))}
      </ul>
    </Popover>
  );
}
