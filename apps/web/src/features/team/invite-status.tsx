'use client';

import type { Person } from '@oneohm/api-contracts';
import { IconButton, Popover, StatusPill, useToast } from '@oneohm/design-system/web';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Copy, Ellipsis, Send } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { api, expectStatus } from '@/lib/api/api-client';
import { describeError } from '@/lib/api/api-error';
import { awaitsSignIn, inviteActions } from './invite-actions';
import { useCopyInvite } from './invite-copy';
import { PEOPLE_KEY } from './use-team';

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
  const { copy, dialog } = useCopyInvite();
  const resend = useMutation({
    mutationFn: () => expectStatus(api.people.invitePerson({ params: { id: person.id } }), 202),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: PEOPLE_KEY });
      toast({ title: t('sent'), reference: person.fullName, tone: 'success' });
    },
    onError: (error) => toast({ title: describeError(error), tone: 'error' }),
  });

  const actions = inviteActions(person);
  const inviteText = person.inviteText ?? '';
  if (actions.length === 0) return null;

  // Invites off: copying the text is the one thing to do, so it is the row's own button.
  if (!actions.includes('sendAgain'))
    return (
      <>
        <IconButton
          label={t('copyTextFor', { name: person.fullName })}
          size="sm"
          variant="quiet"
          onClick={() => copy(inviteText)}
          className="relative z-[2]"
        >
          <Copy aria-hidden />
        </IconButton>
        {dialog}
      </>
    );

  const items = actions.map((key) =>
    key === 'sendAgain'
      ? { key, icon: Send, run: () => resend.mutate() }
      : { key, icon: Copy, run: () => copy(inviteText) },
  );

  return (
    <>
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
      {dialog}
    </>
  );
}
