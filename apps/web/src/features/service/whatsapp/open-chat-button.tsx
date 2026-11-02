'use client';

import { Button, useToast } from '@oneohm/design-system/web';
import { MessageCircle } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { describeError } from '@/lib/api/api-error';
import { useOpenChat } from './use-whatsapp';

/**
 * WhatsApp a customer or lead from OneOhm: opens their chat in the inbox, from the
 * business number. The whole team sees it, and it stays when people change.
 */
export function OpenChatButton({
  phone,
  label,
}: {
  readonly phone: string;
  readonly label: string;
}) {
  const t = useTranslations('service.whatsapp');
  const router = useRouter();
  const toast = useToast();
  const open = useOpenChat();
  return (
    <Button
      variant="secondary"
      size="sm"
      leadingIcon={<MessageCircle />}
      pending={open.isPending}
      onClick={() =>
        open.mutate(phone, {
          onSuccess: (chat) => router.push(`/today?tab=chats&chat=${chat.id}`),
          onError: (error) =>
            toast({ tone: 'error', title: t('openFailed'), description: describeError(error) }),
        })
      }
    >
      {label}
    </Button>
  );
}
