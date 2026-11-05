/**
 * The app-inbox words for the problem, reward and AMC messages (redesign §4, §12, §15; phase 6).
 * English, Marathi and Hindi; the chat says the same with buttons. Drafted by the OneOhm team; have a
 * native speaker read the Marathi and Hindi once.
 */
type Payload = Readonly<Record<string, string>>;
type Words = (payload: Payload) => { readonly title: string; readonly body: string };

export const CARE_MESSAGES = [
  'problem_fixed_check',
  'reward_upi_ask',
  'amc_renewal_offer',
] as const;
export type CareMessage = (typeof CARE_MESSAGES)[number];

export const CARE_EN: Readonly<Record<CareMessage, Words>> = {
  problem_fixed_check: (p) => ({
    title: `Fixed: ${p.topic}`,
    body: 'Is it working now? Tell us in our WhatsApp chat.',
  }),
  reward_upi_ask: (p) => ({
    title: `Share your UPI ID to receive ${p.amount}`,
    body: 'Your referral reward is approved. Open our WhatsApp chat to share it.',
  }),
  amc_renewal_offer: (p) => ({
    title: 'Your maintenance plan ends soon',
    body: `${p.home}: ends on ${p.date}. Open our WhatsApp chat to renew it.`,
  }),
};

export const CARE_MR: Readonly<Record<CareMessage, Words>> = {
  problem_fixed_check: (p) => ({
    title: `दुरुस्त केले: ${p.topic}`,
    body: 'आता ते नीट चालते का? आमच्या WhatsApp चॅटमध्ये सांगा.',
  }),
  reward_upi_ask: (p) => ({
    title: `${p.amount} मिळवण्यासाठी तुमचा UPI आयडी द्या`,
    body: 'तुमचे रेफरल बक्षीस मंजूर झाले आहे. देण्यासाठी आमचा WhatsApp चॅट उघडा.',
  }),
  amc_renewal_offer: (p) => ({
    title: 'तुमची देखभाल योजना लवकरच संपते',
    body: `${p.home}: ${p.date} रोजी संपते. नूतनीकरणासाठी आमचा WhatsApp चॅट उघडा.`,
  }),
};

export const CARE_HI: Readonly<Record<CareMessage, Words>> = {
  problem_fixed_check: (p) => ({
    title: `ठीक किया: ${p.topic}`,
    body: 'क्या अब यह ठीक चल रहा है? हमारे WhatsApp चैट में बताएँ।',
  }),
  reward_upi_ask: (p) => ({
    title: `${p.amount} पाने के लिए अपना UPI आईडी दें`,
    body: 'आपका रेफरल इनाम मंज़ूर हो गया है। देने के लिए हमारा WhatsApp चैट खोलें।',
  }),
  amc_renewal_offer: (p) => ({
    title: 'आपकी देखरेख योजना जल्द खत्म होगी',
    body: `${p.home}: ${p.date} को खत्म होती है। रिन्यू करने के लिए हमारा WhatsApp चैट खोलें।`,
  }),
};
