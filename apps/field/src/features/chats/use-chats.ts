import type { ChatDetail } from '@oneohm/api-contracts';
import { unwrap } from '@oneohm/mobile-ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/api';
import { useCurrentUser } from '@/session/session-provider';

/** New customer messages show up on their own while a chat is open. */
const POLL_MS = 15_000;

export const chatKeys = {
  all: ['chats'] as const,
  one: (id: string) => ['chats', 'one', id] as const,
};

/** The chats this person answers (the API limits it); only staff have chats. */
export function useMyChats() {
  const user = useCurrentUser();
  return useQuery({
    queryKey: chatKeys.all,
    queryFn: () => unwrap(api.whatsapp.chats()),
    enabled: user.kind === 'staff',
    refetchInterval: POLL_MS * 4,
  });
}

export function useChat(id: string) {
  return useQuery({
    queryKey: chatKeys.one(id),
    queryFn: () => unwrap(api.whatsapp.chat({ params: { id } })),
    refetchInterval: POLL_MS,
  });
}

function useStore() {
  const queryClient = useQueryClient();
  return async (detail: ChatDetail) => {
    queryClient.setQueryData(chatKeys.one(detail.chat.id), detail);
    await queryClient.invalidateQueries({ queryKey: chatKeys.all });
  };
}

export function useSendReply(id: string) {
  const store = useStore();
  return useMutation({
    mutationFn: (text: string) => unwrap(api.whatsapp.reply({ params: { id }, body: { text } })),
    onSuccess: store,
  });
}

export function useHandBack(id: string) {
  const store = useStore();
  return useMutation({
    mutationFn: () => unwrap(api.whatsapp.release({ params: { id } })),
    onSuccess: store,
  });
}

/** Finds or makes the chat with a number (a lead or customer), ready to write in. */
export function useOpenChat() {
  return useMutation({
    mutationFn: (phone: string) => unwrap(api.whatsapp.open({ body: { phone } })),
  });
}
