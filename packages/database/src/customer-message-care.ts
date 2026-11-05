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
  // The SMS version of the fixed check (no chat to open): see SMS_WORDS_OF.
  'problem_fixed_sms',
  'document_share_sms',
  'visit_reminder_sms',
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
  problem_fixed_sms: (p) => ({
    title: `Fixed: ${p.topic}`,
    body: 'Is it working now? Please call us or open the OneOhm app.',
  }),
  document_share_sms: (p) => ({
    title: `Your ${p.document} is ready`,
    body: 'Find it in the OneOhm app or ask our team.',
  }),
  visit_reminder_sms: (p) => ({
    title: `Our team visits ${p.home} ${p.when}`,
    body: `For the ${p.work}.`,
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
  problem_fixed_sms: (p) => ({
    title: `दुरुस्त केले: ${p.topic}`,
    body: 'आता ते नीट चालते का? कृपया आम्हाला फोन करा किंवा OneOhm अ‍ॅप उघडा.',
  }),
  document_share_sms: (p) => ({
    title: `तुमचे ${p.document} तयार आहे`,
    body: 'ते OneOhm अ‍ॅपमध्ये पाहा किंवा आमच्या टीमला विचारा.',
  }),
  visit_reminder_sms: (p) => ({
    title: `आमची टीम ${p.home} येथे ${p.when} येणार आहे`,
    body: `${p.work} साठी.`,
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
  problem_fixed_sms: (p) => ({
    title: `ठीक किया: ${p.topic}`,
    body: 'क्या अब यह ठीक चल रहा है? कृपया हमें फोन करें या OneOhm ऐप खोलें।',
  }),
  document_share_sms: (p) => ({
    title: `आपका ${p.document} तैयार है`,
    body: 'इसे OneOhm ऐप में देखें या हमारी टीम से पूछें।',
  }),
  visit_reminder_sms: (p) => ({
    title: `हमारी टीम ${p.home} पर ${p.when} आ रही है`,
    body: `${p.work} के लिए।`,
  }),
};
