import { formatInr } from '@oneohm/shared';
import { daySpan } from '../../../common/notices';
import { JOURNEY_WORDS } from '../../journey/journey-words';
import { SEND_WORDS } from '../../send-to-customer/send-words';
import { VISIT_WORDS } from '../../visits/visit-words';
import { CHAT_WORDS, DESCRIPTION_MAX, fitTitle, ROW_MAX } from './chat-words';
import { type TapChoice, tapButton } from './closing-taps';
import type { PendingItem } from './pending-items';

/** A problem as the customer wrote it: the stored "(via WhatsApp)" note is not shown. */
export const shownProblem = (description: string) =>
  description.replace(/\s*\(via WhatsApp\)\s*$/u, '');

/** Home's one line for the thing that matters most now (redesign §3). */
export function pendingLine(item: PendingItem): string {
  const home = CHAT_WORDS.home;
  switch (item.kind) {
    case 'paper':
      return home.paper(item.title, item.home);
    case 'pay':
      return home.pay(formatInr(item.leftPaise), item.home);
    case 'location':
      return SEND_WORDS.location.ask(item.home ?? SEND_WORDS.location.anyHome);
    case 'callback':
      return SEND_WORDS.callback.homeLine;
    case 'visit_ask':
      return VISIT_WORDS.pick.homeLine(item.home);
    case 'journey':
      return journeyLine(item);
    case 'visit':
      return item.board
        ? VISIT_WORDS.boardHome(item.home, daySpan(item.on, item.on))
        : home.visit(item.home, daySpan(item.on, item.on));
    case 'problem':
      return home.problem(item.home);
    case 'quote':
      return home.quote;
  }
}

/**
 * The button that does it: [Send it now] (the paper path), [Pay ₹X] (answered with the
 * pay-link message; Payments when paying online is off), [Visit details], [Problem
 * update] or [See quotation].
 */
export function pendingButton(item: PendingItem, paysOnline: boolean): TapChoice {
  const buttons = CHAT_WORDS.buttons;
  switch (item.kind) {
    case 'paper':
      return { id: `sendit:${item.requestId}`, title: buttons.sendItNow };
    case 'pay':
      return paysOnline
        ? { id: `pay:${item.milestoneId}`, title: CHAT_WORDS.pay(formatInr(item.leftPaise)) }
        : 'payments';
    case 'location':
      return { id: `locreq:${item.requestId}`, title: SEND_WORDS.buttons.sendLocation };
    case 'callback':
      return { id: `cbask:${item.requestId}`, title: SEND_WORDS.buttons.pickTime };
    case 'visit_ask':
      return { id: `vask:${item.requestId}`, title: VISIT_WORDS.buttons.pick };
    case 'journey':
      return item.ask === 'roof_now'
        ? { id: `rdy:now:${item.requestId}`, title: JOURNEY_WORDS.buttons.readyNow }
        : { id: `jr:${item.requestId}`, title: JOURNEY_WORDS.buttons.answerNow };
    case 'visit':
      return { id: 'go:visit', title: buttons.visit };
    case 'problem':
      return { id: 'go:problems', title: buttons.problemUpdate };
    case 'quote':
      return { id: `quote_show:${item.quotationId}`, title: buttons.quote };
  }
}

type Row = { id: string; title: string; description: string };

/** One row of [See them]: the same action as the item's button, with a short line. */
function pendingRow(item: PendingItem, paysOnline: boolean): Row {
  const { id, title } = tapButton(pendingButton(item, paysOnline));
  const home = CHAT_WORDS.home;
  const description = {
    paper: () => (item.kind === 'paper' ? home.paperRow(item.home) : ''),
    pay: () => (item.kind === 'pay' ? home.payRow(item.home) : ''),
    location: () => (item.kind === 'location' ? (item.home ?? '') : ''),
    callback: () => SEND_WORDS.callback.homeRow,
    visit_ask: () => (item.kind === 'visit_ask' ? (item.home ?? '') : ''),
    journey: () => (item.kind === 'journey' ? (item.home ?? '') : ''),
    visit: () =>
      item.kind === 'visit'
        ? [daySpan(item.on, item.on), item.home].filter(Boolean).join(' · ')
        : '',
    problem: () => (item.kind === 'problem' ? shownProblem(item.description) : ''),
    quote: () => home.quoteRow,
  }[item.kind]();
  // A paper row is named by the paper itself: ten "Send it now" rows would say nothing.
  const named = item.kind === 'paper' ? item.title : title;
  return {
    id,
    title: fitTitle(named, ROW_MAX),
    description: fitTitle(description, DESCRIPTION_MAX),
  };
}

/** The rows of [See them], one per action (WhatsApp refuses two rows with one id), at most 10. */
export function pendingRows(items: readonly PendingItem[], paysOnline: boolean): Row[] {
  const rows = items.map((item) => pendingRow(item, paysOnline));
  return rows
    .filter((row, index) => rows.findIndex((other) => other.id === row.id) === index)
    .slice(0, 10);
}

/** Home's line for a roof or installation question, or a paper to agree to. */
function journeyLine(item: Extract<PendingItem, { kind: 'journey' }>): string {
  const home = item.home ?? SEND_WORDS.location.anyHome;
  const words = JOURNEY_WORDS;
  if (item.ask === 'sign') return words.sign.ask(item.paper ?? '', home);
  if (item.ask === 'install') return words.install.ask(home);
  return item.ask === 'roof_now' ? words.ready.notYet : words.ready.ask(home);
}
