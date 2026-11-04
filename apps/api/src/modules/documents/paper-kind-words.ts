import type { AssistantLanguage } from '../whatsapp/assistant/language';

/** What a kind of paper is called to the customer (the folders they can be asked for). */
const KINDS: Readonly<Record<string, Readonly<Record<AssistantLanguage, string>>>> = {
  customer_kyc: { en: 'Aadhaar / PAN', mr: 'आधार / पॅन', hi: 'आधार / पैन' },
  electricity_bill: { en: 'Electricity bill', mr: 'वीज बिल', hi: 'बिजली बिल' },
  property: {
    en: 'Property papers',
    mr: 'मालमत्तेची कागदपत्रे',
    hi: 'संपत्ति के कागज़ात',
  },
  bank_loan: {
    en: 'Bank and loan papers',
    mr: 'बँक आणि कर्जाची कागदपत्रे',
    hi: 'बैंक और लोन के कागज़ात',
  },
  discom: { en: 'DISCOM papers', mr: 'डिस्कॉमची कागदपत्रे', hi: 'डिस्कॉम के कागज़ात' },
  subsidy: { en: 'Subsidy papers', mr: 'सबसिडीची कागदपत्रे', hi: 'सब्सिडी के कागज़ात' },
  income_proof: { en: 'Income proof', mr: 'उत्पन्नाचा पुरावा', hi: 'आय प्रमाण' },
  payment_proof: { en: 'Payment proof', mr: 'पेमेंटचा पुरावा', hi: 'भुगतान का सबूत' },
};
const ANY: Readonly<Record<AssistantLanguage, string>> = {
  en: 'Paper',
  mr: 'कागदपत्र',
  hi: 'दस्तावेज़',
};

/** The kind of paper in the language of the message it goes in ("Electricity bill"), never a file name. */
export function paperKindWords(language: AssistantLanguage, category: string): string {
  return (KINDS[category] ?? ANY)[language];
}
