import { type MilestoneShare, type MilestoneTrigger, planMilestones } from '@oneohm/domain';
import { formatInr } from '@oneohm/shared';
import { localized, type Words } from '../whatsapp/assistant/language';

/**
 * The quote's money in one plain line (live review C1): the full price, the instalments
 * in whole rupees from the payment plan that will apply, and the subsidy coming back to
 * the bank later. Said on the quote buttons and on the accept check; no quote number in
 * the chat words (it stays in the PDF and its caption). Buttons keep 20 characters.
 */
const EN_MONEY = {
  when: {
    quotation_accepted: 'on acceptance',
    material_dispatch: 'before dispatch',
    commissioning_completed: 'after installation',
    loan_disbursement: 'from the bank loan',
  } as Record<MilestoneTrigger, string>,
  part: (amount: string, when: string) => `${amount} ${when}`,
  line: (total: string, count: number, parts: string) =>
    `Full price ${total}, paid in ${count} parts: ${parts}.`,
  subsidy: (amount: string) => `Subsidy ${amount} comes back to your bank after commissioning.`,
  buttonsBody: (money: string) => `Your solar quotation is above.\n${money}\nHappy to go ahead?`,
  accept: 'Accept quote',
  ask: 'I have a question',
  confirm: (total: string, first: string) =>
    `Accept your solar quotation for ${total}? The 1st instalment, ${first}, is due on acceptance.`,
  caption: (number: string) => `Your solar quotation (${number})`,
};

const MR_MONEY: Words<typeof EN_MONEY> = {
  when: {
    quotation_accepted: 'स्वीकारताना',
    material_dispatch: 'साहित्य पाठवण्यापूर्वी',
    commissioning_completed: 'बसवणीनंतर',
    loan_disbursement: 'बँक कर्जातून',
  },
  part: (amount, when) => `${when} ${amount}`,
  line: (total, count, parts) => `पूर्ण किंमत ${total}, ${count} हप्त्यांत: ${parts}.`,
  subsidy: (amount) => `सबसिडीचे ${amount} सिस्टम सुरू झाल्यावर तुमच्या बँक खात्यात परत येतील.`,
  buttonsBody: (money) => `तुमचे सोलर कोटेशन वर पाठवले आहे.\n${money}\nपुढे जायचे का?`,
  accept: 'कोटेशन स्वीकारा',
  ask: 'मला प्रश्न आहे',
  confirm: (total, first) =>
    `${total} चे सोलर कोटेशन स्वीकारायचे? पहिला हप्ता ${first} स्वीकारताना भरायचा आहे.`,
  caption: (number) => `तुमचे सोलर कोटेशन (${number})`,
};

const HI_MONEY: Words<typeof EN_MONEY> = {
  when: {
    quotation_accepted: 'स्वीकार करते समय',
    material_dispatch: 'सामान भेजने से पहले',
    commissioning_completed: 'इंस्टॉलेशन के बाद',
    loan_disbursement: 'बैंक लोन से',
  },
  part: (amount, when) => `${when} ${amount}`,
  line: (total, count, parts) => `पूरी कीमत ${total}, ${count} किस्तों में: ${parts}.`,
  subsidy: (amount) => `सब्सिडी के ${amount} सिस्टम चालू होने के बाद आपके बैंक खाते में वापस आएँगे.`,
  buttonsBody: (money) => `आपका सोलर कोटेशन ऊपर भेजा गया है.\n${money}\nआगे बढ़ें?`,
  accept: 'कोटेशन स्वीकारें',
  ask: 'मेरा एक सवाल है',
  confirm: (total, first) =>
    `${total} का सोलर कोटेशन स्वीकार करें? पहली किस्त ${first} स्वीकार करते समय देनी है.`,
  caption: (number) => `आपका सोलर कोटेशन (${number})`,
};

/** Every language, for the checks. */
export const QUOTE_MONEY_LISTS = { en: EN_MONEY, mr: MR_MONEY, hi: HI_MONEY };
export const QUOTE_MONEY_WORDS = localized(EN_MONEY, { mr: MR_MONEY, hi: HI_MONEY });

/** Whole rupees, as a customer reads an instalment. */
const rupees = (paise: number) => formatInr(Math.round(paise / 100) * 100);

/** The money line and the first instalment, in the language being spoken. */
export function quoteMoney(
  totalPaise: number,
  subsidyPaise: number,
  steps: readonly MilestoneShare[],
): { readonly line: string; readonly firstPaise: number } {
  const W = QUOTE_MONEY_WORDS;
  const parts = planMilestones(totalPaise, steps).filter((part) => part.payer === 'customer');
  const said = parts.map((part) => W.part(rupees(part.amountPaise), W.when[part.trigger]));
  const line = W.line(rupees(totalPaise), parts.length, said.join(', '));
  return {
    line: subsidyPaise > 0 ? `${line} ${W.subsidy(rupees(subsidyPaise))}` : line,
    firstPaise: parts[0]?.amountPaise ?? totalPaise,
  };
}
