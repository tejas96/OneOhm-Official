import type { MetaAccess, MetaAppConfig } from '../access';
import type { LaunchInput } from '../types';

export interface Call {
  readonly method: string;
  /** Path after the version, e.g. `act_1/campaigns`. */
  readonly path: string;
  readonly query: URLSearchParams;
  readonly body: Record<string, unknown>;
}

type Reply = unknown | { readonly __status: number; readonly body: unknown };
type Handler = (call: Call) => Reply;

export const status = (code: number, body: unknown) => ({ __status: code, body });

/** A fetch that answers by "METHOD path" and keeps every call it saw. */
export function fakeGraph(routes: Record<string, Handler | Reply>) {
  const calls: Call[] = [];
  const fetch: typeof globalThis.fetch = (async (
    input: string | URL | Request,
    init?: RequestInit,
  ) => {
    const url = new URL(String(input));
    const path = url.pathname.replace(/^\/v[\d.]+\//, '');
    let body: Record<string, unknown> = {};
    if (typeof init?.body === 'string') {
      try {
        body = JSON.parse(init.body);
      } catch {
        body = Object.fromEntries(new URLSearchParams(init.body));
      }
    }
    const call: Call = { method: init?.method ?? 'GET', path, query: url.searchParams, body };
    calls.push(call);
    const key = `${call.method} ${path}`;
    const route = routes[key] ?? routes[`* ${path}`];
    if (route === undefined) throw new Error(`No fake answer for ${key}`);
    const reply = typeof route === 'function' ? (route as Handler)(call) : route;
    const failed = reply as { __status?: number; body?: unknown };
    const code = failed?.__status ?? 200;
    const payload = failed?.__status ? failed.body : reply;
    return new Response(JSON.stringify(payload), { status: code });
  }) as typeof globalThis.fetch;
  return { fetch, calls };
}

export const metaApp = (fetcher: typeof fetch): MetaAppConfig => ({
  appId: 'app1',
  appSecret: 'secret1',
  graphVersion: 'v26.0',
  loginConfigId: null,
  fetch: fetcher,
});

export const metaAccess = (details: MetaAccess['details'] = {}): MetaAccess => ({
  userToken: 'user-token',
  pageToken: 'page-token',
  adAccountId: 'act_123',
  currency: 'INR',
  details: { pageId: 'page1', instagramId: 'ig1', datasetId: 'ds1', ...details },
});

export const launchInput = (over: Partial<LaunchInput> = {}): LaunchInput => ({
  code: 'SOLAR-01',
  name: 'Rooftop solar',
  goal: 'chats',
  channels: ['facebook'],
  headline: 'Cut your bill',
  text: 'Cut your bill\nGo solar',
  media: {
    kind: 'image',
    publicUrl: 'https://x.test/v1/m/1',
    fileName: 'a.jpg',
    contentType: 'image/jpeg',
    width: 1200,
    height: 628,
    bytes: async () => Buffer.from('img'),
    crops: null,
  },
  city: { name: 'Pune', latitude: 18.5, longitude: 73.8, radiusKm: 25 },
  dailyBudgetPaise: 50000,
  landingUrl: 'https://oneohm.test/solar',
  privacyPolicyUrl: 'https://oneohm.test/privacy',
  businessName: 'OneOhm',
  logo: null,
  whatsappNumber: '+91 98765 43210',
  openerText: 'Hi OneOhm SOLAR-01',
  audiences: { interested: null, customers: null, lookalike: null },
  leadWebhookUrl: 'https://x.test/hook',
  previous: {},
  ...over,
});

export const baseRoutes = () => ({
  'POST act_123/adimages': { images: { 'a.jpg': { hash: 'H1' } } },
  'GET act_123/campaigns': { data: [] },
  'POST act_123/campaigns': { id: 'C1' },
  'POST act_123/adsets': { id: 'S1' },
  'POST act_123/adcreatives': { id: 'CR1' },
  'POST act_123/ads': { id: 'A1' },
  'POST A1': { success: true },
  'POST S1': { success: true },
  'POST C1': { success: true },
});
