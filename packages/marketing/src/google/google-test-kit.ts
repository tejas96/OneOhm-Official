import type { GoogleAccess, GoogleAppConfig } from '../access';
import type { Fetch, LaunchInput } from '../types';
import { clearGoogleTokenCache } from './google-ads-http';

/** Test helpers: a fake Google that records every call. Not shipped in the build output's API. */
export interface Call {
  readonly url: string;
  readonly method: string;
  readonly headers: Record<string, string>;
  // biome-ignore lint/suspicious/noExplicitAny: test bodies are inspected freely.
  readonly body: any;
}
export interface Reply {
  readonly status: number;
  readonly body: unknown;
}
export const ok = (body: unknown = {}): Reply => ({ status: 200, body });
export const fail = (status: number, body: unknown): Reply => ({ status, body });

export type Route = readonly [string | RegExp, (call: Call) => Reply | unknown];

/** Routes are tried in order by URL; the first match answers. The token endpoint answers itself. */
export function fakeGoogle(routes: readonly Route[]): { fetch: Fetch; calls: Call[] } {
  const calls: Call[] = [];
  const fetcher = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const raw = init?.body;
    const body =
      typeof raw === 'string' ? (raw.startsWith('{') ? JSON.parse(raw) : raw) : undefined;
    const call: Call = {
      url,
      method: init?.method ?? 'GET',
      headers: Object.fromEntries(Object.entries((init?.headers ?? {}) as Record<string, string>)),
      body,
    };
    calls.push(call);
    const route = routes.find(([match]) =>
      typeof match === 'string' ? url.includes(match) : match.test(url),
    );
    let reply: Reply;
    if (route) {
      const made = route[1](call);
      reply = made && typeof made === 'object' && 'status' in made ? (made as Reply) : ok(made);
    } else if (url.startsWith('https://oauth2.googleapis.com/token')) {
      reply = ok({ access_token: 'at-1', expires_in: 3600 });
    } else {
      throw new Error(`Unexpected call: ${url}`);
    }
    return new Response(JSON.stringify(reply.body), { status: reply.status });
  }) as Fetch;
  return { fetch: fetcher, calls };
}

let counter = 0;

export function testApp(fetcher: Fetch): GoogleAppConfig {
  return {
    clientId: 'client-id',
    clientSecret: 'client-secret',
    developerToken: 'dev-token',
    apiVersion: 'v26',
    fetch: fetcher,
  };
}

export function testAccess(details: GoogleAccess['details'] = {}): GoogleAccess {
  counter += 1;
  clearGoogleTokenCache();
  return { refreshToken: `refresh-${counter}`, customerId: '1234567890', currency: 'INR', details };
}

export function launchInput(changes: Partial<LaunchInput> = {}): LaunchInput {
  return {
    code: 'SOLAR-01',
    name: 'Solar in Pune',
    goal: 'chats',
    channels: ['instagram', 'facebook'],
    headline: 'Cut your light bill with rooftop solar and a government subsidy',
    text: 'Cut your light bill with rooftop solar\nFree site visit and subsidy help for homes across Pune this month.',
    media: {
      kind: 'image',
      publicUrl: 'https://example.test/v1/m/1',
      fileName: 'a.jpg',
      contentType: 'image/jpeg',
      width: 2000,
      height: 1500,
      bytes: async () => Buffer.from('original'),
      crops: {
        landscape: async () => Buffer.from('landscape-bytes'),
        square: async () => Buffer.from('square-bytes'),
      },
    },
    city: { name: 'Pune', latitude: 18.52, longitude: 73.85, radiusKm: 25 },
    dailyBudgetPaise: 50_000,
    landingUrl: 'https://example.test/v1/go/SOLAR-01',
    privacyPolicyUrl: 'https://example.test/privacy',
    businessName: 'Sun Power Energy Solutions Private Limited',
    logo: null,
    whatsappNumber: '+919800000000',
    openerText: 'Hi OneOhm SOLAR-01',
    audiences: { interested: null, customers: null, lookalike: null },
    leadWebhookUrl: 'https://example.test/v1/webhooks/google/leads',
    previous: {},
    ...changes,
  };
}
