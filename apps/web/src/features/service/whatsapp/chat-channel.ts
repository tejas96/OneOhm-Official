import type { ChatSummary } from '@oneohm/api-contracts';

export type ChatChannel = ChatSummary['channel'];

/** Instagram and Facebook chats: no assistant, no phone number, no WhatsApp templates. */
export const isSocial = (channel: ChatChannel): boolean => channel !== 'whatsapp';

/** Whether a free-text reply may be typed now; social chats cannot reply once the window shuts. */
export const canTypeReply = (chat: Pick<ChatSummary, 'channel' | 'windowOpen'>): boolean =>
  chat.windowOpen || !isSocial(chat.channel);
