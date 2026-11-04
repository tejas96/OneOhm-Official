import type { WorkerConfig } from '../config';
import { isRetryableStatus } from './send-errors';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

export interface PushMessage {
  readonly tokens: readonly string[];
  readonly title: string;
  readonly body: string;
  readonly data: Readonly<Record<string, string>>;
}

export type PushTicket =
  | { readonly token: string; readonly ok: true; readonly id: string | null }
  | { readonly token: string; readonly ok: false; readonly error: string; readonly gone: boolean };

export type PushResult =
  | { readonly outcome: 'logged' }
  | { readonly outcome: 'sent'; readonly tickets: readonly PushTicket[] };

export interface PushSender {
  send(message: PushMessage): Promise<PushResult>;
}

/** One Expo message per phone. Expo hands Android alerts to Firebase and iOS ones to Apple. */
export function expoRequestBody(message: PushMessage) {
  return message.tokens.map((to) => ({
    to,
    title: message.title,
    body: message.body,
    data: message.data,
    sound: 'default',
    priority: 'high',
    channelId: 'default',
  }));
}

interface ExpoTicket {
  status?: string;
  id?: string;
  message?: string;
  details?: { error?: string };
}

/** Pairs Expo's answers with the tokens; a phone that uninstalled the app is "gone". */
export function readTickets(
  tokens: readonly string[],
  answers: readonly ExpoTicket[],
): PushTicket[] {
  return tokens.map((token, index) => {
    const answer = answers[index];
    if (answer?.status === 'ok') return { token, ok: true, id: answer.id ?? null };
    const code = answer?.details?.error ?? 'unknown';
    return {
      token,
      ok: false,
      error: answer?.message ?? `Push failed (${code}).`,
      gone: code === 'DeviceNotRegistered',
    };
  });
}

export function createPushSender(config: WorkerConfig, log: (line: string) => void): PushSender {
  if (config.PUSH_DELIVERY === 'log') {
    return {
      async send(message) {
        log(`[push:log] "${message.title}" → ${message.tokens.length} phone(s)`);
        return { outcome: 'logged' };
      },
    };
  }
  return {
    async send(message) {
      const response = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
          ...(config.EXPO_ACCESS_TOKEN
            ? { authorization: `Bearer ${config.EXPO_ACCESS_TOKEN}` }
            : {}),
        },
        body: JSON.stringify(expoRequestBody(message)),
        signal: AbortSignal.timeout(15_000),
      });
      const body = (await response.json().catch(() => ({}))) as {
        data?: ExpoTicket[];
        errors?: { message?: string }[];
      };
      if (response.ok && body.data)
        return { outcome: 'sent', tickets: readTickets(message.tokens, body.data) };
      const reason = `Expo push ${response.status}: ${body.errors?.[0]?.message ?? 'request failed'}`;
      if (isRetryableStatus(response.status) || response.ok) throw new Error(reason);
      return {
        outcome: 'sent',
        tickets: message.tokens.map((token) => ({ token, ok: false, error: reason, gone: false })),
      };
    },
  };
}
