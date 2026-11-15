import { PlatformError } from '../errors';
import type { Fetch } from '../types';
import { createGraph, graphError } from './meta-graph';

/** The WhatsApp Business account the existing WhatsApp settings name (not the ads login). */
export interface WhatsAppAccount {
  readonly token: string;
  readonly wabaId: string;
  readonly graphVersion: string;
  /** For the image example Meta wants with a photo template (resumable upload). */
  readonly appId: string | null;
  readonly fetch: Fetch;
}

export interface TemplateSubmission {
  readonly name: string;
  readonly language: string;
  readonly category: 'MARKETING' | 'UTILITY';
  /** The approved wording with {{1}}, {{2}}… */
  readonly body: string;
  /** One example value for each {{n}}, in order. */
  readonly examples: readonly string[];
  /** A photo on top; Meta wants an example image. */
  readonly headerImage: { readonly bytes: Buffer; readonly contentType: string } | null;
}

export type TemplateApproval = 'approved' | 'pending' | 'rejected' | 'not_sent';

const graphFor = (account: WhatsAppAccount) =>
  createGraph({ fetch: account.fetch, version: account.graphVersion, token: account.token });

const approvalOf = (status: string | undefined): TemplateApproval => {
  if (status === 'APPROVED') return 'approved';
  if (status === 'REJECTED' || status === 'DISABLED') return 'rejected';
  return 'pending';
};

/** The two-step upload Meta wants for the example photo; gives back the handle. */
async function uploadExample(
  account: WhatsAppAccount,
  image: { readonly bytes: Buffer; readonly contentType: string },
): Promise<string> {
  const graph = graphFor(account);
  const session = await graph.post<{ id: string }>(
    `${account.appId}/uploads`,
    {},
    { query: { file_length: image.bytes.length, file_type: image.contentType } },
  );
  let response: Response;
  try {
    response = await account.fetch(
      `https://graph.facebook.com/${account.graphVersion}/${session.id}`,
      {
        method: 'POST',
        headers: { Authorization: `OAuth ${account.token}`, file_offset: '0' },
        body: new Uint8Array(image.bytes),
        signal: AbortSignal.timeout(30_000),
      },
    );
  } catch {
    throw new PlatformError('temporary', 'Meta did not answer in time. Try again in a minute.');
  }
  const body = (await response.json().catch(() => ({}))) as { h?: string };
  if (!response.ok || !body.h) throw graphError(response.status, body);
  return body.h;
}

/** Sends one template to Meta for approval. */
export async function submitWhatsAppTemplate(
  account: WhatsAppAccount,
  template: TemplateSubmission,
): Promise<{ readonly status: TemplateApproval; readonly withImage: boolean }> {
  const components: Record<string, unknown>[] = [];
  // Without an app id the example photo cannot be uploaded, so the template goes text-only.
  const withImage = Boolean(template.headerImage && account.appId);
  if (template.headerImage && account.appId) {
    const handle = await uploadExample(account, template.headerImage);
    components.push({ type: 'HEADER', format: 'IMAGE', example: { header_handle: [handle] } });
  }
  components.push({
    type: 'BODY',
    text: template.body,
    ...(template.examples.length > 0 ? { example: { body_text: [template.examples] } } : {}),
  });
  try {
    const reply = await graphFor(account).post<{ status?: string }>(
      `${account.wabaId}/message_templates`,
      {
        name: template.name,
        language: template.language,
        category: template.category,
        components,
      },
    );
    return { status: approvalOf(reply.status), withImage };
  } catch (error) {
    if (error instanceof PlatformError && /already exist/i.test(error.detail ?? '')) {
      const found = await whatsAppTemplateStatuses(account, [template.name]);
      return { status: found[0]?.status ?? 'pending', withImage };
    }
    throw error;
  }
}

/** Where Meta's approval stands for these template names (any language). */
export async function whatsAppTemplateStatuses(
  account: WhatsAppAccount,
  names: readonly string[],
): Promise<
  readonly {
    readonly name: string;
    readonly status: TemplateApproval;
    readonly hasImage: boolean;
    readonly reason: string | null;
  }[]
> {
  const rows = await graphFor(account).getAll<{
    name: string;
    status?: string;
    components?: { type: string; format?: string }[];
    rejected_reason?: string;
  }>(`${account.wabaId}/message_templates`, {
    fields: 'name,status,language,components,rejected_reason',
    limit: 200,
  });
  return rows
    .filter((row) => names.includes(row.name))
    .map((row) => ({
      name: row.name,
      status: approvalOf(row.status),
      hasImage: (row.components ?? []).some((c) => c.type === 'HEADER' && c.format === 'IMAGE'),
      reason: row.rejected_reason && row.rejected_reason !== 'NONE' ? row.rejected_reason : null,
    }));
}
