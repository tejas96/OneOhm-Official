import { localized } from '../whatsapp/assistant/language';

/** What the customer reads on the pay landing page, in their language (PRD 5.1). */
export const PAY_PAGE_WORDS = localized(
  {
    expired: 'This link has expired. Ask us on WhatsApp for a new one.',
    title: 'Solar payment',
    ask: (amount: string, label: string) => `Pay ${amount} to OneOhm for ${label}.`,
    go: 'Continue to pay',
    byCode: {
      not_due: 'This payment is not due yet. We will tell you when it is.',
      paid: 'This is already paid. Thank you!',
      bank_share: 'Your bank pays this share directly. Nothing to pay here.',
      off: 'Online payment is not available right now. Please call your contact.',
    } as Readonly<Record<string, string>>,
  },
  {
    mr: {
      expired: 'ही लिंक संपली आहे. नवीन लिंकसाठी आम्हाला WhatsApp वर विचारा.',
      title: 'सोलर पेमेंट',
      ask: (amount, label) => `${label} साठी OneOhm ला ${amount} भरा.`,
      go: 'पेमेंट करा',
      byCode: {
        not_due: 'हे पेमेंट अजून देय नाही. वेळ आल्यावर आम्ही कळवू.',
        paid: 'हे आधीच भरले आहे. धन्यवाद!',
        bank_share: 'हा हिस्सा तुमची बँक थेट भरते. इथे काही भरायचे नाही.',
        off: 'ऑनलाइन पेमेंट सध्या उपलब्ध नाही. कृपया तुमच्या संपर्क व्यक्तीला फोन करा.',
      },
    },
    hi: {
      expired: 'यह लिंक खत्म हो गई है। नई लिंक के लिए हमें WhatsApp पर पूछें।',
      title: 'सोलर भुगतान',
      ask: (amount, label) => `${label} के लिए OneOhm को ${amount} का भुगतान करें।`,
      go: 'भुगतान करें',
      byCode: {
        not_due: 'यह भुगतान अभी देय नहीं है। समय आने पर हम बताएँगे।',
        paid: 'इसका भुगतान हो चुका है। धन्यवाद!',
        bank_share: 'यह हिस्सा आपका बैंक सीधे भरता है। यहाँ कुछ भरना नहीं है।',
        off: 'ऑनलाइन भुगतान अभी उपलब्ध नहीं है। कृपया अपने संपर्क व्यक्ति को फ़ोन करें।',
      },
    },
  },
);
