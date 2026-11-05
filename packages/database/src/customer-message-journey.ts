/**
 * The app-inbox words for the journey messages (redesign §18 10, 13, 14, 16): a paper to sign, the
 * roof and installation checks, and the handover pack. English, Marathi and Hindi; the chat says the
 * same with buttons. Drafted by the OneOhm team; have a native speaker read the Marathi and Hindi once.
 */
type Payload = Readonly<Record<string, string>>;
type Words = (payload: Payload) => { readonly title: string; readonly body: string };

export const JOURNEY_MESSAGES = [
  'signature_request',
  'site_ready_check',
  'installation_check',
  'handover_pack',
  'signature_reminder',
  'site_ready_reminder',
] as const;
export type JourneyMessage = (typeof JOURNEY_MESSAGES)[number];

export const JOURNEY_EN: Readonly<Record<JourneyMessage, Words>> = {
  signature_request: (p) => ({
    title: `Please read your ${p.document}`,
    body: `For ${p.home}. Open our WhatsApp chat and tap I agree, then send a photo of the signed page.`,
  }),
  site_ready_check: (p) => ({
    title: `Is the roof at ${p.home} ready?`,
    body: 'It needs a clear roof, a power point and someone at home. Answer in our WhatsApp chat.',
  }),
  installation_check: (p) => ({
    title: `Is the installation at ${p.home} finished?`,
    body: 'Please tell us in our WhatsApp chat if it is finished to your satisfaction.',
  }),
  handover_pack: (p) => ({
    title: `Your ${p.count} handover papers`,
    body: `For ${p.home}. They are also in Documents.`,
  }),
  signature_reminder: (p) => ({
    title: `Reminder: please read your ${p.document}`,
    body: `For ${p.home}. Open our WhatsApp chat and tell us if you agree.`,
  }),
  site_ready_reminder: (p) => ({
    title: `We are waiting for the roof at ${p.home}`,
    body: 'Tell us in our WhatsApp chat when it is ready for installation.',
  }),
};

export const JOURNEY_MR: Readonly<Record<JourneyMessage, Words>> = {
  signature_request: (p) => ({
    title: `कृपया तुमचे ${p.document} वाचा`,
    body: `${p.home} साठी. आमच्या WhatsApp चॅटमध्ये ‘मी सहमत आहे’ दाबा, मग सही केलेल्या पानाचा फोटो पाठवा.`,
  }),
  site_ready_check: (p) => ({
    title: `${p.home} येथील छप्पर तयार आहे का?`,
    body: 'मोकळे छप्पर, एक पॉवर पॉइंट आणि घरी कोणीतरी हवे. आमच्या WhatsApp चॅटमध्ये उत्तर द्या.',
  }),
  installation_check: (p) => ({
    title: `${p.home} येथील बसवणी पूर्ण झाली आहे का?`,
    body: 'तुमच्या समाधानानुसार पूर्ण झाली का, ते आमच्या WhatsApp चॅटमध्ये सांगा.',
  }),
  handover_pack: (p) => ({
    title: `तुमची ${p.count} हस्तांतर कागदपत्रे`,
    body: `${p.home} साठी. ती कागदपत्रे विभागातही आहेत.`,
  }),
  signature_reminder: (p) => ({
    title: `आठवण: कृपया तुमचे ${p.document} वाचा`,
    body: `${p.home} साठी. सहमत आहात का ते आमच्या WhatsApp चॅटमध्ये सांगा.`,
  }),
  site_ready_reminder: (p) => ({
    title: `${p.home} येथील छप्पर तयार होण्याची वाट पाहत आहोत`,
    body: 'बसवणीसाठी तयार झाल्यावर आमच्या WhatsApp चॅटमध्ये सांगा.',
  }),
};

export const JOURNEY_HI: Readonly<Record<JourneyMessage, Words>> = {
  signature_request: (p) => ({
    title: `कृपया अपना ${p.document} पढ़ें`,
    body: `${p.home} के लिए। हमारे WhatsApp चैट में ‘मैं सहमत हूँ’ दबाएँ, फिर हस्ताक्षर किए पन्ने की फ़ोटो भेजें।`,
  }),
  site_ready_check: (p) => ({
    title: `क्या ${p.home} की छत तैयार है?`,
    body: 'खाली छत, एक पावर पॉइंट और घर पर कोई होना चाहिए। हमारे WhatsApp चैट में जवाब दें।',
  }),
  installation_check: (p) => ({
    title: `क्या ${p.home} पर इंस्टॉलेशन पूरा हो गया?`,
    body: 'आपकी संतुष्टि के अनुसार पूरा हुआ या नहीं, हमारे WhatsApp चैट में बताएँ।',
  }),
  handover_pack: (p) => ({
    title: `आपके ${p.count} हैंडओवर कागज़`,
    body: `${p.home} के लिए। वे दस्तावेज़ में भी हैं।`,
  }),
  signature_reminder: (p) => ({
    title: `याद दिलाना: कृपया अपना ${p.document} पढ़ें`,
    body: `${p.home} के लिए। सहमत हैं या नहीं, हमारे WhatsApp चैट में बताएँ।`,
  }),
  site_ready_reminder: (p) => ({
    title: `हम ${p.home} की छत के तैयार होने का इंतज़ार कर रहे हैं`,
    body: 'इंस्टॉलेशन के लिए तैयार होने पर हमारे WhatsApp चैट में बताएँ।',
  }),
};
