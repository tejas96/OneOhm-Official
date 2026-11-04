import { FORMS } from '../modules/whatsapp/forms/form-registry';

/**
 * `pnpm --filter @oneohm/api forms:publish [--yes]`: creates each WhatsApp form (Flow) in the
 * business account, uploads its Flow JSON, publishes it and prints the flow id to paste into
 * Settings → WhatsApp → Forms. It CHANGES THE META ACCOUNT, so without `--yes` it only
 * prints what it would do and calls nothing. A published flow cannot be edited, so each form
 * version is its own flow, named "OneOhm <name> v<version>"; running it again for a version
 * that is already published only prints the id.
 *
 * Needs WHATSAPP_ACCESS_TOKEN and WHATSAPP_BUSINESS_ACCOUNT_ID (WHATSAPP_API_VERSION is v25.0
 * unless set), read from the environment or the repository's .env.
 */
const live = process.argv.includes('--yes');
const token = process.env.WHATSAPP_ACCESS_TOKEN;
const account = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID;
const version = process.env.WHATSAPP_API_VERSION ?? 'v25.0';
const base = `https://graph.facebook.com/${version}`;

interface Problem {
  readonly message?: string;
  readonly error?: string;
}
interface GraphReply {
  readonly id?: string;
  readonly success?: boolean;
  readonly validation_errors?: readonly Problem[];
  readonly data?: readonly { id: string; name: string; status: string }[];
  readonly error?: { message?: string };
}

async function graph(path: string, init: RequestInit = {}): Promise<GraphReply> {
  const response = await fetch(`${base}/${path}`, {
    ...init,
    headers: { authorization: `Bearer ${token}`, ...(init.headers ?? {}) },
    signal: AbortSignal.timeout(30_000),
  });
  const body = (await response.json().catch(() => ({}))) as GraphReply;
  if (!response.ok) throw new Error(`${path}: ${response.status} ${body.error?.message ?? ''}`);
  return body;
}

const json = (body: unknown): RequestInit => ({
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});

function checked(reply: GraphReply, what: string): void {
  const problems = reply.validation_errors ?? [];
  if (problems.length === 0) return;
  for (const problem of problems) console.error(`  ${what}: ${problem.message ?? problem.error}`);
  throw new Error(`${what} has validation errors; nothing was published.`);
}

async function publishForm(form: (typeof FORMS)[number], known: NonNullable<GraphReply['data']>) {
  const name = `OneOhm ${form.name} v${form.version}`;
  const existing = known.find((flow) => flow.name === name);
  if (existing?.status === 'PUBLISHED') {
    console.info(`${form.key}: already published as flow ${existing.id}`);
    return;
  }
  let id = existing?.id;
  if (!id) {
    const made = await graph(`${account}/flows`, json({ name, categories: form.categories }));
    id = made.id;
    console.info(`${form.key}: created draft flow ${id}`);
  }
  if (!id) throw new Error(`${form.key}: Meta did not return a flow id.`);
  const data = new FormData();
  data.set(
    'file',
    new Blob([JSON.stringify(form.flowJson)], { type: 'application/json' }),
    'flow.json',
  );
  data.set('name', 'flow.json');
  data.set('asset_type', 'FLOW_JSON');
  checked(await graph(`${id}/assets`, { method: 'POST', body: data }), form.key);
  await graph(`${id}/publish`, { method: 'POST' });
  console.info(`${form.key}: published. Flow id ${id} — paste it in Settings → WhatsApp → Forms.`);
}

async function main() {
  if (!live) {
    for (const form of FORMS)
      console.info(
        `Would create (or reuse) the flow "OneOhm ${form.name} v${form.version}" in account ${account ?? '(WHATSAPP_BUSINESS_ACCOUNT_ID missing)'}, upload its Flow JSON, publish it and print its id. Nothing was called; add --yes to do it.`,
      );
    return;
  }
  if (!token || !account)
    throw new Error('Set WHATSAPP_ACCESS_TOKEN and WHATSAPP_BUSINESS_ACCOUNT_ID first.');
  const known = (await graph(`${account}/flows?fields=id,name,status&limit=100`)).data ?? [];
  for (const form of FORMS) await publishForm(form, known);
}

main().catch((error: unknown) => {
  console.error(String(error));
  process.exit(1);
});
