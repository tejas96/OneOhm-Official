import { Inject, Injectable } from '@nestjs/common';
import { isPersonDocumentCategory } from '@oneohm/domain';
import { DATABASE, type Database } from '../../../config/core.module';
import { customerHomes } from '../../customer-portal/customer-homes';
import { paperKindWords } from '../../documents/paper-kind-words';
import { DocumentChecklistService } from '../../reports/document-checklist.service';
import { CHAT_WORDS, DESCRIPTION_MAX, fitTitle, ROW_MAX } from '../assistant/chat-words';
import { languageNow } from '../assistant/language';
import { askedRows, missingRows } from '../assistant/what-reads';
import { WHAT_WORDS } from '../assistant/what-words';
import { MEDIA_WORDS } from '../assistant/words';
import { type Conversation, queueReply } from '../chat-store';
import { FormSendService } from './form-send';
import { FORM_WORDS, sendPaperStart } from './form-words';

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const ASKED_TAP = new RegExp(`^form:a:(${UUID})$`);
const HOME_TAP = new RegExp(`^form:h:(${UUID}):(${UUID})$`);
const ITEM_TAP = new RegExp(`^form:i:(${UUID}|person):([\\w-]+)$`);

type FormTap =
  | { readonly t: 'a'; readonly actionId: string }
  /** The home picked for an asked paper that had none, before its form opens. */
  | { readonly t: 'h'; readonly actionId: string; readonly propertyId: string }
  | { readonly t: 'i'; readonly key: string; readonly propertyId: string | null };

export function readFormTap(id: string | null | undefined): FormTap | null {
  const asked = ASKED_TAP.exec(id ?? '');
  if (asked?.[1]) return { t: 'a', actionId: asked[1] };
  const home = HOME_TAP.exec(id ?? '');
  if (home?.[1] && home[2]) return { t: 'h', actionId: home[1], propertyId: home[2] };
  const item = ITEM_TAP.exec(id ?? '');
  if (item?.[1] && item[2])
    return { t: 'i', key: item[2], propertyId: item[1] === 'person' ? null : item[1] };
  return null;
}

export const isFormTap = (id: string | null | undefined) => readFormTap(id) !== null;

const ROWS = 10;
const row = (id: string, title: string, description?: string) => ({
  id,
  title: fitTitle(title, ROW_MAX),
  ...(description ? { description: fitTitle(description, DESCRIPTION_MAX) } : {}),
});

/**
 * "What do you want to send?" when no single paper is asked: the papers we asked for, then the
 * checklist papers still missing (the rows of "What is this?"), and a tap opens the form for
 * that paper and its home. Each missing paper is already per home, so no home is asked again.
 */
@Injectable()
export class FormPickService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly checklists: DocumentChecklistService,
    private readonly forms: FormSendService,
  ) {}

  /** Sends the list; false when there is nothing to choose from (the caller says it in words). */
  async offer(chat: Conversation, customerId: string): Promise<boolean> {
    const homes = await customerHomes(this.db, customerId);
    const { rows: asked } = await askedRows(this.db, customerId, homes);
    const askedKeys = new Set(asked.map((one) => one.title));
    const missing = (await missingRows(this.checklists, homes)).filter(
      (one) => !askedKeys.has(one.title),
    );
    const rows = [
      ...asked.map((one) =>
        row(
          `form:a:${one.id}`,
          one.title,
          one.person ? WHAT_WORDS.allHomes : (one.home ?? undefined),
        ),
      ),
      ...missing.map((one) =>
        row(
          `form:i:${one.propertyId ?? 'person'}:${one.key}`,
          one.title,
          one.propertyId === null ? WHAT_WORDS.allHomes : (one.home ?? undefined),
        ),
      ),
    ].slice(0, ROWS);
    if (rows.length === 0) return false;
    await queueReply(this.db, chat, {
      kind: 'list',
      body: FORM_WORDS.whatToSend,
      button: WHAT_WORDS.choose,
      rows,
    });
    return true;
  }

  /**
   * An asked home paper whose home is not known, for a customer with 2+ homes: "For which home?"
   * first (the rows open this paper's form on that home). False when no question is needed.
   */
  async askHome(
    chat: Conversation,
    customerId: string,
    paper: { id: string; category: string; propertyId: string | null },
  ): Promise<boolean> {
    if (paper.propertyId || isPersonDocumentCategory(paper.category)) return false;
    const homes = await customerHomes(this.db, customerId);
    if (homes.length < 2) return false;
    await queueReply(this.db, chat, {
      kind: 'list',
      body: WHAT_WORDS.whichHome,
      button: WHAT_WORDS.choose,
      rows: homes.slice(0, ROWS).map((home) => ({
        id: `form:h:${paper.id}:${home.propertyId}`,
        title: home.title,
        description: home.description,
      })),
    });
    return true;
  }

  /** A row tapped: the form for that paper; a paper that is gone is said so and the list offered again. */
  async tapped(chat: Conversation, customerId: string, tap: FormTap): Promise<void> {
    const homes = await customerHomes(this.db, customerId);
    const done =
      tap.t === 'i'
        ? await this.openItem(chat, customerId, tap, homes)
        : await this.openAsked(chat, customerId, tap, homes);
    if (done) return;
    await queueReply(this.db, chat, { kind: 'text', body: MEDIA_WORDS.paperGone });
    await this.offer(chat, customerId);
  }

  /** An asked paper (or the home picked for it): "For which home?" first when it has none. */
  private async openAsked(
    chat: Conversation,
    customerId: string,
    tap: Extract<FormTap, { t: 'a' | 'h' }>,
    homes: Awaited<ReturnType<typeof customerHomes>>,
  ): Promise<boolean> {
    const { papers } = await askedRows(this.db, customerId, homes);
    const paper = papers.find((one) => one.id === tap.actionId);
    const picked = tap.t === 'h' ? homes.find((h) => h.propertyId === tap.propertyId) : undefined;
    if (!paper || (tap.t === 'h' && !picked)) return false;
    if (tap.t === 'a' && (await this.askHome(chat, customerId, paper))) return true;
    const person = isPersonDocumentCategory(paper.category);
    const home = person
      ? null
      : (picked?.title ??
        homes.find((h) => h.propertyId === paper.propertyId)?.title ??
        (homes.length === 1 ? (homes[0]?.title ?? null) : null));
    const name = person ? paperKindWords(languageNow(), paper.category) : paper.title;
    const start = sendPaperStart(name, home, {
      actionId: paper.id,
      ...(picked ? { propertyId: picked.propertyId } : {}),
    });
    const fallback = CHAT_WORDS.paper.ask(paper.title, home);
    await this.forms.sendForm(chat, customerId, 'send_paper', start, fallback);
    return true;
  }

  /** A missing checklist paper on its home: its form. */
  private async openItem(
    chat: Conversation,
    customerId: string,
    tap: Extract<FormTap, { t: 'i' }>,
    homes: Awaited<ReturnType<typeof customerHomes>>,
  ): Promise<boolean> {
    const found = (await missingRows(this.checklists, homes)).find(
      (one) => one.key === tap.key && one.propertyId === tap.propertyId,
    );
    if (!found) return false;
    const start = sendPaperStart(found.title, found.home, {
      key: found.key,
      propertyId: found.propertyId,
    });
    const fallback = CHAT_WORDS.paper.ask(found.title, found.home);
    await this.forms.sendForm(chat, customerId, 'send_paper', start, fallback);
    return true;
  }
}
