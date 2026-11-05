import { localized, type Words } from '../whatsapp/assistant/language';

/** The five taps of the one rating system, and what follows them (redesign §13). */
const EN = {
  stage: {
    survey: 'site survey',
    installation: 'installation',
    commissioning: 'switch-on and handover',
  } as Record<string, string>,
  askStage: (stage: string) => `How was your ${stage}? Please tap a rating.`,
  askProblem: (topic: string) => `How was our help with "${topic}"? Please tap a rating.`,
  button: 'Rate us',
  section: 'Your rating',
  rows: [
    { title: 'Very happy', description: '5 of 5' },
    { title: 'Happy', description: '4 of 5' },
    { title: 'Okay', description: '3 of 5' },
    { title: 'Not happy', description: '2 of 5' },
    { title: 'Very unhappy', description: '1 of 5' },
  ],
  thanks: 'Thank you for rating us! 🙏 It helps the team.',
  sorry: (name: string, when: string) => `Sorry to hear that. *${name}* will call you ${when}.`,
  team: 'Our team',
  nothing: 'Nothing is waiting for your rating right now. Thank you!',
  old: 'You have rated this already. Thank you!',
};

const MR: Words<typeof EN> = {
  stage: {
    survey: 'साइट सर्व्हे',
    installation: 'इन्स्टॉलेशन',
    commissioning: 'सिस्टिम सुरू करणे आणि हस्तांतरण',
  },
  askStage: (stage) => `तुमचा ${stage} कसा वाटला? कृपया रेटिंग दाबा.`,
  askProblem: (topic) => `"${topic}" साठी आमची मदत कशी वाटली? कृपया रेटिंग दाबा.`,
  button: 'रेटिंग द्या',
  section: 'तुमचे रेटिंग',
  rows: [
    { title: 'खूप आनंदी', description: '५ पैकी ५' },
    { title: 'आनंदी', description: '५ पैकी ४' },
    { title: 'ठीक आहे', description: '५ पैकी ३' },
    { title: 'नाखूश', description: '५ पैकी २' },
    { title: 'खूप नाखूश', description: '५ पैकी १' },
  ],
  thanks: 'रेटिंग दिल्याबद्दल धन्यवाद! 🙏 टीमला मदत होते.',
  sorry: (name, when) => `हे ऐकून वाईट वाटले. *${name}* तुम्हाला ${when} फोन करतील.`,
  team: 'आमची टीम',
  nothing: 'सध्या तुमच्या रेटिंगची कोणतीही वाट पाहत नाही. धन्यवाद!',
  old: 'तुम्ही आधीच रेटिंग दिले आहे. धन्यवाद!',
};

const HI: Words<typeof EN> = {
  stage: { survey: 'साइट सर्वे', installation: 'इंस्टॉलेशन', commissioning: 'सिस्टम चालू करना और हैंडओवर' },
  askStage: (stage) => `आपका ${stage} कैसा रहा? कृपया रेटिंग दबाएँ।`,
  askProblem: (topic) => `"${topic}" में हमारी मदद कैसी रही? कृपया रेटिंग दबाएँ।`,
  button: 'रेटिंग दें',
  section: 'आपकी रेटिंग',
  rows: [
    { title: 'बहुत खुश', description: '5 में से 5' },
    { title: 'खुश', description: '5 में से 4' },
    { title: 'ठीक है', description: '5 में से 3' },
    { title: 'नाखुश', description: '5 में से 2' },
    { title: 'बहुत नाखुश', description: '5 में से 1' },
  ],
  thanks: 'रेटिंग देने के लिए धन्यवाद! 🙏 इससे टीम को मदद मिलती है।',
  sorry: (name, when) => `यह सुनकर बुरा लगा। *${name}* आपको ${when} फ़ोन करेंगे।`,
  team: 'हमारी टीम',
  nothing: 'अभी आपकी रेटिंग का कोई इंतज़ार नहीं है। धन्यवाद!',
  old: 'आप पहले ही रेटिंग दे चुके हैं। धन्यवाद!',
};

export const RATING_LISTS = { en: EN, mr: MR, hi: HI };
export const RATING_WORDS = localized(EN, { mr: MR, hi: HI });
