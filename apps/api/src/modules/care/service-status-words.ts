import { localized, type Words } from '../whatsapp/assistant/language';

/** The service desk's progress news in the chat (en/mr/hi); the resolved news is the "Is it fixed?" check. */
const EN = {
  inProgress: (topic: string) =>
    `Good news: our team has started work on your request "${topic}" 🔧 We will tell you here when it is done.`,
  booked: (topic: string, day: string) =>
    `A visit for your request "${topic}" is booked for ${day}. Our technician will come then.`,
};

const MR: Words<typeof EN> = {
  inProgress: (topic) =>
    `छान बातमी: तुमच्या "${topic}" विनंतीवर आमच्या टीमने काम सुरू केले आहे 🔧 काम झाल्यावर आम्ही इथे कळवू.`,
  booked: (topic, day) => `तुमच्या "${topic}" विनंतीसाठी ${day} रोजी भेट ठरली आहे. आमचे तंत्रज्ञ तेव्हा येतील.`,
};

const HI: Words<typeof EN> = {
  inProgress: (topic) =>
    `अच्छी खबर: हमारी टीम ने आपके "${topic}" अनुरोध पर काम शुरू कर दिया है 🔧 काम पूरा होने पर हम यहाँ बताएँगे।`,
  booked: (topic, day) =>
    `आपके "${topic}" अनुरोध के लिए ${day} को विज़िट तय हुई है। हमारे तकनीशियन तब आएँगे।`,
};

export const SERVICE_STATUS_LISTS = { en: EN, mr: MR, hi: HI };
export const SERVICE_STATUS_WORDS = localized(EN, { mr: MR, hi: HI });
