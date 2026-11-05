import { Inject, Injectable } from '@nestjs/common';
import { DATABASE, type Database, ENVIRONMENT } from '../../../config/core.module';
import type { Environment } from '../../../config/environment';
import { CustomerDocumentsService } from '../../customer-portal/customer-documents.service';
import { CustomerPortalService } from '../../customer-portal/customer-portal.service';
import { type Conversation, queueReply } from '../chat-store';
import { sharedFileUrl } from '../file-links';
import { sayWithTaps } from './closing-taps';
import { customerPapers, type Paper, receiptById } from './customer-papers';
import { PAPER_WORDS } from './paper-words';
import { WORDS } from './words';

/** A list keeps 10 rows. */
const PAPER_ROWS = 10;

/**
 * The Documents answer (live QA round 2, redesign §11): the papers as a list, newest first,
 * and a tapped paper sent as the file itself with a one-line caption (never a link that
 * expires or looks unsafe). Meta fetches the file when it sends, so the short-lived link
 * never reaches the customer. One paper goes at once. Receipts alone: `receipts`.
 */
@Injectable()
export class PaperRepliesService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(ENVIRONMENT) private readonly env: Environment,
    private readonly portal: CustomerPortalService,
    private readonly documents: CustomerDocumentsService,
  ) {}

  async show(
    chat: Conversation,
    customerId: string,
    only?: (paper: Paper) => boolean,
    none: string = WORDS.noDocuments,
  ) {
    const papers = (await this.papers(customerId)).filter(only ?? (() => true));
    const [first] = papers;
    if (!first)
      return sayWithTaps(this.db, chat, none, only ? ['payments', 'menu'] : ['update', 'menu']);
    if (papers.length === 1) return this.send(chat, first);
    const more = papers.length > PAPER_ROWS ? `\n${PAPER_WORDS.more}` : '';
    await queueReply(this.db, chat, {
      kind: 'list',
      body: `${PAPER_WORDS.pick}${more}`,
      button: PAPER_WORDS.button,
      rows: papers.slice(0, PAPER_ROWS).map(({ id, title, description }) => ({
        id,
        title,
        // WhatsApp keeps a row's description to 72 characters.
        ...(description ? { description: description.slice(0, 72) } : {}),
      })),
    });
  }

  /** The customer's payment receipts only (Payments → Receipts). */
  receipts(chat: Conversation, customerId: string): Promise<void> {
    const receipt = (paper: Paper) => paper.id.startsWith('paper:receipt:');
    return this.show(chat, customerId, receipt, PAPER_WORDS.none);
  }

  /** Our invoices and receipts ("Which bill?" → Our invoice). */
  invoices(chat: Conversation, customerId: string): Promise<void> {
    const ours = (paper: Paper) => /^paper:(invoice|receipt):/.test(paper.id);
    return this.show(chat, customerId, ours, PAPER_WORDS.noInvoices);
  }

  /**
   * A tapped paper; one no longer theirs is said so, then the latest list. A receipt is
   * looked up by its own id, so "View receipt" works on any receipt, however old (M12).
   */
  async tapped(chat: Conversation, customerId: string, tapId: string): Promise<void> {
    const receiptId = /^paper:receipt:([0-9a-f-]{36})$/.exec(tapId)?.[1];
    const paper = receiptId
      ? await receiptById(this.db, customerId, receiptId)
      : (await this.papers(customerId)).find((entry) => entry.id === tapId);
    if (paper) return this.send(chat, paper);
    await queueReply(this.db, chat, { kind: 'text', body: PAPER_WORDS.gone });
    return this.show(chat, customerId);
  }

  /** The file with its one-line caption; nothing after it (redesign §11). */
  private async send(chat: Conversation, paper: Paper): Promise<void> {
    await queueReply(this.db, chat, {
      kind: 'document',
      link: sharedFileUrl(this.env, paper.file),
      filename: paper.filename,
      caption: paper.caption,
    });
  }

  private papers(customerId: string) {
    return customerPapers(
      { db: this.db, portal: this.portal, documents: this.documents },
      customerId,
    );
  }
}
