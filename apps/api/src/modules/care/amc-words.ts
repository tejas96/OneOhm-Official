import { localized, type Words } from '../whatsapp/assistant/language';

/** The AMC renewal offer and what follows the customer's tap (redesign §4). Buttons keep 20 characters. */
const EN = {
  offer: (home: string, date: string) =>
    `The annual maintenance plan for your ${home} solar ends on ${date}. Renew it to keep your free visits and cleaning.`,
  renew: 'Renew AMC',
  renewed: (name: string, when: string) =>
    `Thank you! *${name}* will call you ${when} to renew your AMC.`,
  team: 'Our team',
  old: 'This offer is closed. Thank you!',
  what: 'your AMC renewal',
  cancelled: 'You do not need to answer about the AMC renewal any more. Thank you.',
};

const MR: Words<typeof EN> = {
  offer: (home, date) =>
    `तुमच्या ${home} सोलरची वार्षिक देखभाल योजना ${date} रोजी संपते. मोफत भेटी आणि सफाई चालू ठेवण्यासाठी ती नूतनीकरण करा.`,
  renew: 'AMC नूतनीकरण',
  renewed: (name, when) => `धन्यवाद! AMC नूतनीकरणासाठी *${name}* तुम्हाला ${when} फोन करतील.`,
  team: 'आमची टीम',
  old: 'ही ऑफर बंद झाली आहे. धन्यवाद!',
  what: 'AMC नूतनीकरण',
  cancelled: 'AMC नूतनीकरणाबद्दल उत्तर देण्याची आता गरज नाही. धन्यवाद.',
};

const HI: Words<typeof EN> = {
  offer: (home, date) =>
    `आपके ${home} सोलर की सालाना देखरेख योजना ${date} को खत्म होती है। मुफ़्त विज़िट और सफ़ाई जारी रखने के लिए इसे रिन्यू करें।`,
  renew: 'AMC रिन्यू करें',
  renewed: (name, when) => `धन्यवाद! AMC रिन्यू करने के लिए *${name}* आपको ${when} फ़ोन करेंगे।`,
  team: 'हमारी टीम',
  old: 'यह ऑफ़र बंद हो गया है। धन्यवाद!',
  what: 'AMC रिन्यू',
  cancelled: 'AMC रिन्यू के बारे में जवाब देने की अब ज़रूरत नहीं। धन्यवाद।',
};

export const AMC_LISTS = { en: EN, mr: MR, hi: HI };
export const AMC_WORDS = localized(EN, { mr: MR, hi: HI });
