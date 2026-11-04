import { Inject, Injectable } from '@nestjs/common';
import { customers } from '@oneohm/database';
import { titleCaseName, todayIn } from '@oneohm/shared';
import { eq } from 'drizzle-orm';
import { DATABASE, type Database, ENVIRONMENT } from '../../../config/core.module';
import type { Environment } from '../../../config/environment';
import { CustomerPortalService } from '../../customer-portal/customer-portal.service';
import { PaymentLinksService } from '../../online-payments/payment-links.service';
import { ensureChatOwner, tellChatTeam } from '../chat-owner';
import { type Conversation, queueReply } from '../chat-store';
import { CHAT_WORDS, ROW_MAX, talkTitle } from './chat-words';
import { sayWithTaps, type TapChoice } from './closing-taps';
import { HandOverService } from './hand-over';
import { pendingButton, pendingLine, pendingRows } from './home-lines';
import { pendingForCustomer } from './pending-items';
import { stageCount } from './progress-line';

/**
 * Home (redesign §3), shown for "hi", Menu or "menu": "Hi Tejas 👋", one line of what
 * matters now and three buttons: the action for it, the next most useful, then More.
 * Also the More list and [See them]. Known customers only; strangers keep their own flow.
 */
@Injectable()
export class HomeService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(ENVIRONMENT) private readonly env: Environment,
    private readonly portal: CustomerPortalService,
    private readonly people: HandOverService,
    private readonly links: PaymentLinksService,
  ) {}

  async show(chat: Conversation, customerId: string): Promise<void> {
    const [items, { projects }, first, name] = await Promise.all([
      this.pending(customerId),
      this.portal.home(customerId),
      this.firstName(customerId),
      this.people.answererName(chat),
    ]);
    if (projects.length === 0 && items.length === 0) return this.noProject(chat, first, name);
    const [project] = projects;
    const stage = project && projects.length === 1 ? stageCount(project) : null;
    const where =
      !project || !stage
        ? ''
        : stage.complete
          ? ` ${CHAT_WORDS.home.complete(project.place)}`
          : ` ${CHAT_WORDS.home.stage(project.place, stage.stage, stage.done, stage.steps)}`;
    const [top] = items;
    const body = [
      `${CHAT_WORDS.home.hello(first)}${where}`,
      top ? pendingLine(top) : CHAT_WORDS.home.nothing,
      items.length >= 2 ? CHAT_WORDS.home.count(items.length) : '',
    ].filter(Boolean);
    const talk = { id: 'go:talk', title: talkTitle(name) };
    const next: TapChoice =
      items.length >= 2
        ? { id: 'go:see', title: CHAT_WORDS.buttons.seeThem }
        : projects.length > 0
          ? 'update'
          : talk;
    const taps: TapChoice[] = top
      ? [pendingButton(top, this.paysOnline()), next, 'more']
      : ['update', 'problem', 'more'];
    return sayWithTaps(this.db, chat, body.join('\n'), taps);
  }

  /** [See them]: every item that needs the customer, each row opening its answer. */
  async seeThem(chat: Conversation, customerId: string): Promise<void> {
    const items = await this.pending(customerId);
    if (items.length === 0) return this.show(chat, customerId);
    await queueReply(this.db, chat, {
      kind: 'list',
      body: CHAT_WORDS.home.seeThem,
      button: CHAT_WORDS.buttons.seeThem,
      rows: pendingRows(items, this.paysOnline()),
    });
  }

  /** [More]: the ten rows (redesign §3), Talk to {name} among them. */
  async more(chat: Conversation): Promise<void> {
    const name = await this.people.answererName(chat);
    const rows = Object.entries(CHAT_WORDS.more.rows).map(([choice, row]) => ({
      id: `go:${choice}`,
      title: choice === 'talk' ? talkTitle(name, ROW_MAX) : row.title,
      description: row.description,
    }));
    await queueReply(this.db, chat, {
      kind: 'list',
      body: CHAT_WORDS.more.body,
      button: CHAT_WORDS.listButton,
      rows,
    });
  }

  /**
   * No project yet (redesign §3): we are preparing their plan and their person calls. The
   * chat's person (or the desk) gets a follow-up alert, once a day per chat.
   */
  private async noProject(chat: Conversation, first: string, name: string | null) {
    const when = this.people.when();
    const owned = await ensureChatOwner(this.db, chat);
    const today = todayIn(this.env.BUSINESS_TIMEZONE, new Date());
    await tellChatTeam(this.db, owned, {
      kind: 'whatsapp_follow_up',
      title: `Call ${chat.profileName ?? first}: no project yet`,
      body: `${first} wrote on WhatsApp and has no project yet. We told them you will call (${when === 'now' ? 'today' : when}).`,
      key: `wa_no_project:${chat.id}:${today}`,
    });
    const body = `${CHAT_WORDS.home.hello(first)}\n${CHAT_WORDS.home.noProject(name, when)}`;
    return sayWithTaps(this.db, chat, body, [{ id: 'go:talk', title: talkTitle(name) }, 'more']);
  }

  private pending(customerId: string) {
    return pendingForCustomer(this.db, customerId, todayIn(this.env.BUSINESS_TIMEZONE, new Date()));
  }

  /** True when online payment is on, so a due amount gets its Pay ₹X button. */
  paysOnline(): boolean {
    return this.env.RAZORPAY_MODE !== 'off' && this.links.setup().mode !== 'off';
  }

  private async firstName(customerId: string): Promise<string> {
    const [customer] = await this.db
      .select({ name: customers.name })
      .from(customers)
      .where(eq(customers.id, customerId));
    const name = customer?.name ?? '';
    return titleCaseName(name.split(/\s+/)[0] ?? name);
  }
}
