'use client';

import type { ChatDetail, Delivery } from '@oneohm/api-contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, expectStatus } from '@/lib/api/api-client';

/** The inbox refreshes on its own while it is open, so new customer messages show up. */
export const POLL_MS = 15_000;

export const whatsappKeys = {
  chats: ['whatsapp', 'chats'] as const,
  chat: (id: string) => ['whatsapp', 'chat', id] as const,
  deliveries: (state: Delivery['state'] | undefined) =>
    ['whatsapp', 'deliveries', state ?? 'all'] as const,
};

export function useChats() {
  return useQuery({
    queryKey: whatsappKeys.chats,
    queryFn: () => expectStatus(api.whatsapp.chats(), 200),
    refetchInterval: POLL_MS,
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
    await queryClient.invalidateQueries({ queryKey: whatsappKeys.chats });
    await queryClient.invalidateQueries({ queryKey: ['whatsapp', 'deliveries'] });
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
