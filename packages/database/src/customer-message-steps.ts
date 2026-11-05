/**
 * The app-inbox words for the subsidy, loan and layout messages (redesign §4, §18 11, 15; phase 4b).
 * English, Marathi and Hindi; the chat says the same with buttons. Drafted by the OneOhm team; have a
 * native speaker read the Marathi and Hindi once.
 */
type Payload = Readonly<Record<string, string>>;
type Words = (payload: Payload) => { readonly title: string; readonly body: string };

export const STEP_MESSAGES = [
  'subsidy_register_help',
  'subsidy_credit_check',
  'bank_sign_visit',
  'layout_approval',
  'loan_sanctioned',
  'loan_disbursed',
  'loan_rejected',
] as const;
export type StepMessage = (typeof STEP_MESSAGES)[number];

export const STEP_EN: Readonly<Record<StepMessage, Words>> = {
  subsidy_register_help: (p) => ({
    title: `Register on the PM Surya Ghar portal for ${p.home}`,
    body: 'It takes about 5 minutes at pmsuryaghar.gov.in. Tell us in our WhatsApp chat when it is done.',
  }),
  subsidy_credit_check: (p) => ({
    title: `Did the ${p.amount} subsidy reach you?`,
    body: `For ${p.home}. Please tell us in our WhatsApp chat.`,
  }),
  bank_sign_visit: (p) => ({
    title: `Sign the loan papers at ${p.bank}`,
    body: `${p.branch}, on ${p.day}. Tell us in our WhatsApp chat if you cannot go.`,
  }),
  layout_approval: (p) => ({
    title: `Your panel layout for ${p.home}`,
    body: 'Open our WhatsApp chat to see it and tell us if it looks good.',
  }),
  loan_sanctioned: (p) => ({
    title: 'Your loan is sanctioned',
    body: `${p.bank} sanctioned ${p.amount}. We will guide you on the next steps.`,
  }),
  loan_disbursed: (p) => ({
    title: 'Loan money sent',
    body: `${p.bank} sent ${p.amount} for your solar.`,
  }),
  loan_rejected: (p) => ({
    title: 'The loan was not approved',
    body: `${p.bank} did not approve it. ${p.staff} will call you to plan the next steps.`,
  }),
};

export const STEP_MR: Readonly<Record<StepMessage, Words>> = {
  subsidy_register_help: (p) => ({
    title: `${p.home} साठी पीएम सूर्य घर पोर्टलवर नोंदणी करा`,
    body: 'pmsuryaghar.gov.in वर सुमारे ५ मिनिटे लागतात. झाल्यावर आमच्या WhatsApp चॅटमध्ये सांगा.',
  }),
  subsidy_credit_check: (p) => ({
    title: `${p.amount} सबसिडी तुम्हाला मिळाली का?`,
    body: `${p.home} साठी. कृपया आमच्या WhatsApp चॅटमध्ये सांगा.`,
  }),
  bank_sign_visit: (p) => ({
    title: `${p.bank} मध्ये कर्जाच्या कागदपत्रांवर सही करा`,
    body: `${p.branch}, ${p.day} रोजी. जाणे शक्य नसल्यास आमच्या WhatsApp चॅटमध्ये सांगा.`,
  }),
  layout_approval: (p) => ({
    title: `${p.home} साठी तुमचा पॅनेल आराखडा`,
    body: 'तो पाहण्यासाठी आमचे WhatsApp चॅट उघडा आणि आवडला का ते सांगा.',
  }),
  loan_sanctioned: (p) => ({
    title: 'तुमचे कर्ज मंजूर झाले',
    body: `${p.bank} ने ${p.amount} मंजूर केले. पुढच्या पायऱ्यांसाठी आम्ही मदत करू.`,
  }),
  loan_disbursed: (p) => ({
    title: 'कर्जाची रक्कम पाठवली',
    body: `${p.bank} ने तुमच्या सोलरसाठी ${p.amount} पाठवले.`,
  }),
  loan_rejected: (p) => ({
    title: 'कर्ज मंजूर झाले नाही',
    body: `${p.bank} ने ते मंजूर केले नाही. पुढच्या योजनेसाठी ${p.staff} तुम्हाला फोन करतील.`,
  }),
};

export const STEP_HI: Readonly<Record<StepMessage, Words>> = {
  subsidy_register_help: (p) => ({
    title: `${p.home} के लिए पीएम सूर्य घर पोर्टल पर रजिस्टर करें`,
    body: 'pmsuryaghar.gov.in पर लगभग 5 मिनट लगते हैं। हो जाए तो हमारे WhatsApp चैट में बताएँ।',
  }),
  subsidy_credit_check: (p) => ({
    title: `क्या ${p.amount} की सब्सिडी आपको मिल गई?`,
    body: `${p.home} के लिए। कृपया हमारे WhatsApp चैट में बताएँ।`,
  }),
  bank_sign_visit: (p) => ({
    title: `${p.bank} में लोन के कागज़ों पर हस्ताक्षर करें`,
    body: `${p.branch}, ${p.day} को। न जा सकें तो हमारे WhatsApp चैट में बताएँ।`,
  }),
  layout_approval: (p) => ({
    title: `${p.home} के लिए आपका पैनल लेआउट`,
    body: 'उसे देखने के लिए हमारा WhatsApp चैट खोलें और बताएँ कि पसंद आया या नहीं।',
  }),
  loan_sanctioned: (p) => ({
    title: 'आपका लोन स्वीकृत हो गया',
    body: `${p.bank} ने ${p.amount} स्वीकृत किया। अगले कदम में हम आपकी मदद करेंगे।`,
  }),
  loan_disbursed: (p) => ({
    title: 'लोन की रकम भेजी गई',
    body: `${p.bank} ने आपके सोलर के लिए ${p.amount} भेजे।`,
  }),
  loan_rejected: (p) => ({
    title: 'लोन स्वीकृत नहीं हुआ',
    body: `${p.bank} ने इसे स्वीकृत नहीं किया। आगे की योजना के लिए ${p.staff} आपको फ़ोन करेंगे।`,
  }),
};
