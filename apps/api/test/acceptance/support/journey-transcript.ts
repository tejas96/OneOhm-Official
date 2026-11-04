import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { MessageTemplate } from '@oneohm/api-contracts';
import { renderTemplate, templateExtras } from '@oneohm/domain';
import { rows } from './db';
import type { Session } from './http';
import { type InboundMessage, sendInbound } from './whatsapp';

/**
 * The readable record of one customer's WhatsApp journey, built from what really happened:
 * every message the test sends as the customer, every outbox row queued for their phone
 * (in order), and an "Our side" line per step with what changed in our records.
 */
const REPO = join(__dirname, '../../../../..');

/** The approved template's buttons, by the payload field they carry (shown as Meta shows them). */
const TEMPLATE_BUTTONS: Record<string, string> = {
  acceptPayload: 'Accept quote',
  askPayload: 'I have a question',
  payToken: 'Pay now',
};

interface Outgoing {
  id: string;
  recipient: string;
  template: string;
  payload: Record<string, unknown>;
}
type Choice = { id: string; title: string };

const tags = (choices: unknown) =>
  ((choices as Choice[] | undefined) ?? []).map((choice) => `[${choice.title}]`).join(' ');
const lines = (text: string) => text.trim().replace(/\n+/g, '  \n');

export class Transcript {
  private readonly out: string[] = [];
  private readonly seen = new Set<string>();
  private readonly offered = new Map<string, string>();
  private readonly lists = new Set<string>();
  private readonly who = new Map<string, string>();
  private templates = new Map<string, MessageTemplate>();

  constructor(
    private readonly title: string,
    readonly phone: string,
    readonly profileName: string,
  ) {
    this.who.set(phone, 'Customer');
  }

  /** Reads the template wordings, so template messages read as the customer gets them. */
  async load(admin: Session): Promise<void> {
    const list = await admin.get<MessageTemplate[]>('/settings/message-templates');
    this.templates = new Map(list.map((template) => [template.key, template]));
  }

  /** Another number in the same story (a family member). */
  alsoFrom(phone: string, label: string): void {
    this.who.set(phone, label);
  }

  step(title: string): void {
    this.out.push('', `## ${title}`, '');
  }

  /** Sends one message as `from` (default: the customer) and records the bot's answer. */
  async send(message: InboundMessage, from = this.phone): Promise<void> {
    this.out.push(`**${this.who.get(from) ?? from}:** ${this.describe(message)}  `);
    await sendInbound(from, { profileName: this.profileName, ...message });
    await this.collect();
  }

  /** Taps a choice the bot offered, as a list row or a button, the way it was offered. */
  tap(id: string, from = this.phone): Promise<void> {
    return this.send(this.lists.has(id) ? { listReply: id } : { buttonReply: id }, from);
  }

  /** Records what reached the customer without them writing (staff sent a quote, a payment). */
  async collect(): Promise<void> {
    const sent = await rows<Outgoing>(
      `SELECT id, recipient, template, payload FROM outbox WHERE recipient = ANY($1)
        ORDER BY created_at, id`,
      [[...this.who.keys()]],
    );
    for (const row of sent.filter((candidate) => !this.seen.has(candidate.id))) {
      this.seen.add(row.id);
      const to = row.recipient === this.phone ? '' : ` (to ${this.who.get(row.recipient)})`;
      this.out.push(`**Bot${to}:** ${this.render(row)}  `);
    }
  }

  ourSide(text: string): void {
    this.out.push('', `> **Our side:** ${text}`, '');
  }

  /** Writes the markdown to docs/testing/, relative to the repository root. */
  write(path: string, intro: string): void {
    const file = join(REPO, path);
    mkdirSync(dirname(file), { recursive: true });
    const head = [`# ${this.title}`, '', intro, ''];
    writeFileSync(
      file,
      `${[...head, ...this.out]
        .join('\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim()}\n`,
    );
  }

  private describe(message: InboundMessage): string {
    const tapped = message.buttonReply ?? message.listReply ?? message.buttonPayload;
    if (tapped !== undefined) return `taps [${this.offered.get(tapped) ?? tapped}]`;
    if (message.media) return `📷 sends a ${message.media.type} (${message.media.mimeType})`;
    const ad = message.referral ? ` _(from the Meta ad "${message.referral.headline}")_` : '';
    return `"${message.text ?? ''}"${ad}`;
  }

  private remember(choices: unknown, list = false): void {
    for (const choice of (choices as Choice[] | undefined) ?? []) {
      this.offered.set(choice.id, choice.title);
      if (list) this.lists.add(choice.id);
      else this.lists.delete(choice.id);
    }
  }

  private render(row: Outgoing): string {
    const p = row.payload;
    if (row.template.startsWith('session:')) {
      this.remember(p.buttons);
      this.remember(p.rows, true);
      if (p.kind === 'document')
        return `📄 ${String(p.filename)} — ${lines(String(p.caption ?? ''))}`;
      if (p.kind === 'cta_url') return `${lines(String(p.body))}  \n[${String(p.label)}] (link)`;
      const choices = `${tags(p.buttons)} ${tags(p.rows)}`.trim();
      return `${lines(String(p.body ?? ''))}${choices ? `  \n${choices}` : ''}`;
    }
    return this.renderTemplate(row.template, p);
  }

  /** An approved template as the customer reads it, with the file and buttons Meta adds. */
  private renderTemplate(key: string, p: Record<string, unknown>): string {
    const template = this.templates.get(key);
    const text = template
      ? renderTemplate(template.preview, template.fields, p as Record<string, string>)
      : JSON.stringify(p);
    const extras = templateExtras(key);
    const file = extras?.document && p.documentName ? `  \n📄 ${String(p.documentName)}` : '';
    const fields = [
      ...(extras?.quickReplies ?? []),
      ...(extras?.urlButton ? [extras.urlButton] : []),
    ];
    for (const field of fields)
      if (typeof p[field] === 'string')
        this.offered.set(String(p[field]), TEMPLATE_BUTTONS[field] ?? field);
    const buttons = fields.map((field) => `[${TEMPLATE_BUTTONS[field] ?? field}]`).join(' ');
    return `_(template ${key})_ ${lines(text)}${file}${buttons ? `  \n${buttons}` : ''}`;
  }
}
