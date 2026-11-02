'use client';

import type { ChatDetail, Delivery } from '@oneohm/api-contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, expectStatus } from '@/lib/api/api-client';
import { useCurrentUser } from '@/providers/current-user';

/** The inbox refreshes on its own while it is open, so new customer messages show up. */
export const POLL_MS = 15_000;

export const whatsappKeys = {
  chats: ['whatsapp', 'chats'] as const,
  chat: (id: string) => ['whatsapp', 'chat', id] as const,
  deliveries: (state: Delivery['state'] | undefined) =>
    ['whatsapp', 'deliveries', state ?? 'all'] as const,
};

/** The chats this person answers (all of them for the desk); only staff have chats. */
export function useChats() {
  const user = useCurrentUser();
  return useQuery({
    queryKey: whatsappKeys.chats,
    queryFn: () => expectStatus(api.whatsapp.chats(), 200),
    enabled: user.kind === 'staff',
    refetchInterval: POLL_MS,
  });
}

/** The chat with a number, or null; a lead or customer page looks without making one. */
export function useChatByPhone(phone: string, customerId?: string) {
  return useQuery({
    queryKey: ['whatsapp', 'by-phone', phone, customerId ?? null] as const,
    queryFn: async () =>
      (
        await expectStatus(
          api.whatsapp.byPhone({ query: customerId ? { phone, customerId } : { phone } }),
          200,
        )
      ).detail,
    refetchInterval: POLL_MS,
  });
}

/** "Pass to…": hand the chat to another team member. */
export function usePassChat(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) =>
      expectStatus(api.whatsapp.assign({ params: { id }, body: { userId } }), 200),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['whatsapp'] }),
  });
}

export function useChat(id: string) {
  return useQuery({
    queryKey: whatsappKeys.chat(id),
    queryFn: () => expectStatus(api.whatsapp.chat({ params: { id } }), 200),
    refetchInterval: POLL_MS,
  });
}

/** Puts the fresh chat in the cache and lets the list and the log catch up. */
function useStoreChat() {
  const queryClient = useQueryClient();
  return async (detail: ChatDetail) => {
    queryClient.setQueryData(whatsappKeys.chat(detail.chat.id), detail);
    // The list, the log and any customer or lead page showing this chat catch up.
    await queryClient.invalidateQueries({ queryKey: ['whatsapp'] });
  };
}

export function useReply(id: string) {
  const store = useStoreChat();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (text: string) =>
      expectStatus(api.whatsapp.reply({ params: { id }, body: { text } }), 201),
    onSuccess: store,
    // A closed window or a stale chat: show what the server now knows.
    onError: () => queryClient.invalidateQueries({ queryKey: whatsappKeys.chat(id) }),
  });
}

/** Finds or makes the chat with a number, so the team writes from OneOhm, not a phone. */
export function useOpenChat() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (phone: string) => expectStatus(api.whatsapp.open({ body: { phone } }), 200),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['whatsapp'] }),
  });
}

export function useRelease(id: string) {
  const store = useStoreChat();
  return useMutation({
    mutationFn: () => expectStatus(api.whatsapp.release({ params: { id } }), 200),
    onSuccess: store,
  });
}

export function useDeliveries(state: Delivery['state'] | undefined) {
  return useQuery({
    queryKey: whatsappKeys.deliveries(state),
    queryFn: () => expectStatus(api.whatsapp.deliveries({ query: state ? { state } : {} }), 200),
    refetchInterval: POLL_MS,
  });
}

export function useRetryDelivery() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => expectStatus(api.whatsapp.retryDelivery({ params: { id } }), 200),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['whatsapp', 'deliveries'] }),
  });
}
