import type { Database, DatabaseExecutor } from '@oneohm/database';
import { projects, users, waConversations } from '@oneohm/database';
import { eq } from 'drizzle-orm';
import { conflict } from '../../common/http/errors';
import type { Environment } from '../../config/environment';
import type { CustomerDocumentsService } from '../customer-portal/customer-documents.service';
import type { CustomerPortalService } from '../customer-portal/customer-portal.service';
import { paperFileName } from '../reports/pdf-file-name';
import { customerPapers, type Paper } from '../whatsapp/assistant/customer-papers';
import { PAPER_WORDS } from '../whatsapp/assistant/paper-words';
import { answererName } from '../whatsapp/chat-owner';
import type { SendContext } from './send-context';
import { SEND_WORDS } from './send-words';

export interface Deps {
  readonly db: Database;
  readonly env: Environment;
  readonly portal: CustomerPortalService;
  readonly documents: CustomerDocumentsService;
}

/** A paper of the customer by the id their paper list gives, or `document:<id>` for one file. */
export async function resolvePaper(deps: Deps, ctx: SendContext, paperId: string): Promise<Paper> {
  const { db, portal, documents } = deps;
  const papers = await customerPapers({ db, portal, documents }, ctx.customerId);
  const listed = papers.find((paper) => paper.id === paperId);
  if (listed) return listed;
  const id = /^document:([0-9a-f-]{36})$/.exec(paperId)?.[1];
  const shown = id ? (await documents.list(ctx.customerId)).find((doc) => doc.id === id) : null;
  if (!id || !shown) {
    throw conflict('The customer cannot see that document yet.', 'not_shared');
  }
  return {
    id: paperId,
    title: PAPER_WORDS.paper(shown.name),
    file: { kind: 'document', id, customerId: ctx.customerId },
    filename: paperFileName(shown.name, shown.contentType),
    caption: shown.name,
  };
}

/** The name the customer hears for the person who calls: the chat's owner, else the manager. */
export async function callerName(db: DatabaseExecutor, ctx: SendContext): Promise<string> {
  const [chat] = await db
    .select()
    .from(waConversations)
    .where(eq(waConversations.phone, ctx.phone))
    .limit(1);
  const owner = chat ? await answererName(db, chat) : null;
  if (owner) return owner;
  if (!ctx.projectId) return SEND_WORDS.callback.team;
  const [manager] = await db
    .select({ name: users.fullName })
    .from(projects)
    .innerJoin(users, eq(users.id, projects.managerUserId))
    .where(eq(projects.id, ctx.projectId));
  return manager?.name.split(/\s+/)[0] ?? SEND_WORDS.callback.team;
}
