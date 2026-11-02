'use client';

import type { ChatSummary } from '@oneohm/api-contracts';
import { Select, useToast } from '@oneohm/design-system/web';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { api, expectStatus } from '@/lib/api/api-client';
import { describeError } from '@/lib/api/api-error';
import { usePassChat } from './use-whatsapp';

/** "Pass to…": who answers this chat; picking someone tells them. */
export function PassChat({ chat }: { readonly chat: ChatSummary }) {
  const t = useTranslations('service.whatsapp');
  const toast = useToast();
  const pass = usePassChat(chat.id);
  const team = useQuery({
    queryKey: ['whatsapp', 'team'],
    queryFn: () => expectStatus(api.whatsapp.team(), 200),
    staleTime: 5 * 60_000,
  });
  const options = (team.data ?? []).map((person) => ({ value: person.id, label: person.name }));
  if (options.length === 0) return null;
  return (
    <Select
      label={t('passTitle')}
      value={chat.assignee?.id}
      placeholder={t('passTo')}
      options={options}
      className="h-9 w-44"
      disabled={pass.isPending}
      onValueChange={(userId) =>
        pass.mutate(userId, {
          onSuccess: (next) =>
            toast({ tone: 'success', title: t('passDone', { name: next.assignee?.name ?? '' }) }),
          onError: (error) =>
            toast({ tone: 'error', title: t('passFailed'), description: describeError(error) }),
        })
      }
    />
  );
}
