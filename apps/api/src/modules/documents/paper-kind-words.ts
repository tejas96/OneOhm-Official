import { customers, type DatabaseExecutor } from '@oneohm/database';
import { customerLanguage } from '@oneohm/domain';
import { eq } from 'drizzle-orm';

type Language = 'en-IN' | 'mr-IN' | 'hi-IN';

/** What a kind of paper is called to the customer (the folders they can be asked for). */
const KINDS: Readonly<Record<string, Readonly<Record<Language, string>>>> = {
  customer_kyc: { 'en-IN': 'Aadhaar / PAN', 'mr-IN': 'आधार / पॅन', 'hi-IN': 'आधार / पैन' },
  electricity_bill: { 'en-IN': 'Electricity bill', 'mr-IN': 'वीज बिल', 'hi-IN': 'बिजली बिल' },
  property: {
    'en-IN': 'Property papers',
    'mr-IN': 'मालमत्तेची कागदपत्रे',
    'hi-IN': 'संपत्ति के कागज़ात',
  },
  bank_loan: {
    'en-IN': 'Bank and loan papers',
    'mr-IN': 'बँक आणि कर्जाची कागदपत्रे',
    'hi-IN': 'बैंक और लोन के कागज़ात',
  },
  discom: { 'en-IN': 'DISCOM papers', 'mr-IN': 'डिस्कॉमची कागदपत्रे', 'hi-IN': 'डिस्कॉम के कागज़ात' },
  subsidy: { 'en-IN': 'Subsidy papers', 'mr-IN': 'सबसिडीची कागदपत्रे', 'hi-IN': 'सब्सिडी के कागज़ात' },
  income_proof: { 'en-IN': 'Income proof', 'mr-IN': 'उत्पन्नाचा पुरावा', 'hi-IN': 'आय प्रमाण' },
};
const ANY: Readonly<Record<Language, string>> = {
  'en-IN': 'Paper',
  'mr-IN': 'कागदपत्र',
  'hi-IN': 'दस्तावेज़',
};

/** The kind of paper in the customer's language ("Electricity bill"), never a file name. */
export async function paperKindWords(
  db: DatabaseExecutor,
  phone: string,
  category: string,
): Promise<string> {
  const [owner] = await db
    .select({ language: customers.preferredLanguage })
    .from(customers)
    .where(eq(customers.phoneE164, phone))
    .limit(1);
  const language = customerLanguage(owner?.language) as Language;
  return (KINDS[category] ?? ANY)[language];
}
