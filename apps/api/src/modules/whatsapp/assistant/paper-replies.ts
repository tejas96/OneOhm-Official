import { Inject, Injectable } from '@nestjs/common';
import { DATABASE, type Database, ENVIRONMENT } from '../../../config/core.module';
import type { Environment } from '../../../config/environment';
import { CustomerDocumentsService } from '../../customer-portal/customer-documents.service';
import { CustomerPortalService } from '../../customer-portal/customer-portal.service';
import { type Conversation, queueReply } from '../chat-store';
import { sharedFileUrl } from '../file-links';
import { sayWithTaps, TAP_WORDS } from './closing-taps';
import { customerPapers, type Paper, receiptById } from './customer-papers';
import { PAPER_WORDS } from './paper-words';
import { WORDS } from './words';

/** A list keeps 10 rows: the papers and the Back row. */
const PAPER_ROWS = 9;

/**
 * The Documents answer (live QA round 2): the papers as a list, and a tapped paper sent as
 * the file itself (never a link that expires or looks unsafe). Meta fetches the file when
 * it sends, so the short-lived link never reaches the customer. One paper goes at once.
 */
@Injectable()
export class PaperRepliesService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(ENVIRONMENT) private readonly env: Environment,
    private readonly portal: CustomerPortalService,
    private readonly documents: CustomerDocumentsService,
  ) {}

  async show(chat: Conversation, customerId: string): Promise<void> {
    const papers = await this.papers(customerId);
    const [only] = papers;
    if (!only) return sayWithTaps(this.db, chat, WORDS.noDocuments, ['menu', 'talk']);
    if (papers.length === 1) return this.send(chat, only);
    const more = papers.length > PAPER_ROWS ? `\n${PAPER_WORDS.more}` : '';
    await queueReply(this.db, chat, {
      kind: 'list',
      body: `${PAPER_WORDS.pick}${more}`,
      button: PAPER_WORDS.button,
      rows: [
        ...papers.slice(0, PAPER_ROWS).map(({ id, title, description }) => ({
          id,
          title,
          // WhatsApp keeps a row's description to 72 characters.
          ...(description ? { description: description.slice(0, 72) } : {}),
        })),
        { id: 'menu', title: PAPER_WORDS.back },
      ],
    });
  }

  /**
   * A tapped paper; one no longer theirs shows the list again. A receipt is looked up by
   * its own id, so "View receipt" works on any receipt, however old (menu audit M12).
   */
  async tapped(chat: Conversation, customerId: string, tapId: string): Promise<void> {
    const receiptId = /^paper:receipt:([0-9a-f-]{36})$/.exec(tapId)?.[1];
    const paper = receiptId
      ? await receiptById(this.db, customerId, receiptId)
      : (await this.papers(customerId)).find((entry) => entry.id === tapId);
    return paper ? this.send(chat, paper) : this.show(chat, customerId);
  }

  private async send(chat: Conversation, paper: Paper): Promise<void> {
    await queueReply(this.db, chat, {
      kind: 'document',
      link: sharedFileUrl(this.env, paper.file),
      filename: paper.filename,
      caption: paper.caption,
    });
    await sayWithTaps(this.db, chat, TAP_WORDS.whatNext, ['menu', 'talk']);
  }

  private papers(customerId: string) {
    return customerPapers(
      { db: this.db, portal: this.portal, documents: this.documents },
      customerId,
    );
  }
}
