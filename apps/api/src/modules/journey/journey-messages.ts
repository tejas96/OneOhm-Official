import { titleCaseName } from '@oneohm/shared';
import type { Built } from '../send-to-customer/send-messages';
import type { Paper } from '../whatsapp/assistant/customer-papers';
import type { ChatReply } from '../whatsapp/chat-reply';
import {
  agreeTap,
  installBadTap,
  installOkTap,
  notYetTap,
  packTap,
  questionTap,
  readyNowTap,
  readyTap,
} from './journey-taps';
import { JOURNEY_WORDS } from './journey-words';

/**
 * The journey messages as the customer reads them: the chat messages for inside the 24-hour window
 * and the template (with its quick-reply payloads) for outside it. Build them inside the customer's
 * language, as the other "Send to customer" messages are.
 */
const first = (name: string) => titleCaseName(name);
const buttons = () => JOURNEY_WORDS.buttons;

/** The paper, then "Please read your {paper}" with [I agree] [I have a question]. */
export function signatureAsk(
  given: { customer: string; paper: Paper; home: string; link: string },
  actionId: string,
): Built {
  const { paper, home, link } = given;
  return {
    replies: [
      { kind: 'document', link, filename: paper.filename, caption: paper.caption },
      {
        kind: 'buttons',
        body: JOURNEY_WORDS.sign.ask(paper.title, home),
        buttons: [
          { id: agreeTap(actionId), title: buttons().agree },
          { id: questionTap(actionId), title: buttons().question },
        ],
      },
    ],
    template: {
      key: 'signature_request',
      payload: {
        customer: first(given.customer),
        document: paper.title,
        home,
        documentUrl: link,
        documentName: paper.filename,
        agreePayload: agreeTap(actionId),
        questionPayload: questionTap(actionId),
      },
    },
  };
}

/** After "I agree": thanks, then [Send photo] for the signed page (the paper form of the signed copy). */
export const signedCopyAsk = (photoTap: string): ChatReply => ({
  kind: 'buttons',
  body: JOURNEY_WORDS.sign.agreed,
  buttons: [{ id: photoTap, title: buttons().sendPhoto }],
});

/** "Is the roof at {home} ready?" [Yes, ready] [Not yet]. */
export function readinessAsk(customer: string, home: string, actionId: string): Built {
  return {
    replies: [
      {
        kind: 'buttons',
        body: JOURNEY_WORDS.ready.ask(home),
        buttons: [
          { id: readyTap(actionId), title: buttons().yesReady },
          { id: notYetTap(actionId), title: buttons().notYet },
        ],
      },
    ],
    template: {
      key: 'site_ready_check',
      payload: {
        customer: first(customer),
        home,
        yesPayload: readyTap(actionId),
        notYetPayload: notYetTap(actionId),
      },
    },
  };
}

/** The answer to [Not yet]: noted, with [It's ready now] for later. */
export const notYetReply = (actionId: string): ChatReply => ({
  kind: 'buttons',
  body: JOURNEY_WORDS.ready.notYet,
  buttons: [{ id: readyNowTap(actionId), title: buttons().readyNow }],
});

/** "Is the installation at {home} finished to your satisfaction?" [Yes, all good] [Something is wrong]. */
export function installationAsk(customer: string, home: string, actionId: string): Built {
  return {
    replies: [
      {
        kind: 'buttons',
        body: JOURNEY_WORDS.install.ask(home),
        buttons: [
          { id: installOkTap(actionId), title: buttons().allGood },
          { id: installBadTap(actionId), title: buttons().wrong },
        ],
      },
    ],
    template: {
      key: 'installation_check',
      payload: {
        customer: first(customer),
        home,
        yesPayload: installOkTap(actionId),
        wrongPayload: installBadTap(actionId),
      },
    },
  };
}

/** The handover papers as documents in one go, then "Your n handover papers … are above." */
export function handoverPack(
  given: { customer: string; home: string; projectId: string },
  papers: readonly { paper: Paper; link: string }[],
): Built {
  const summary = {
    kind: 'buttons',
    body: JOURNEY_WORDS.pack.summary(papers.length, given.home),
    buttons: [
      { id: 'go:documents', title: buttons().documents },
      { id: 'go:warranty', title: buttons().warranty },
    ],
  } as const;
  return {
    replies: [
      ...papers.map(
        ({ paper, link }): ChatReply => ({
          kind: 'document',
          link,
          filename: paper.filename,
          caption: paper.caption,
        }),
      ),
      summary,
    ],
    template: {
      key: 'handover_pack',
      payload: {
        customer: first(given.customer),
        count: String(papers.length),
        home: given.home,
        documentsPayload: packTap(given.projectId),
        warrantyPayload: 'go:warranty',
      },
    },
  };
}
