/**
 * The customer's "Track live" page words (Duty Day step 6), in the customer's language. The page
 * has no sign-in, so it does not use the staff app's message files.
 */
export type TrackLanguage = 'en' | 'mr' | 'hi';

export interface TrackWords {
  readonly title: string;
  readonly away: (name: string, minutes: number) => string;
  readonly coming: (name: string) => string;
  readonly to: (home: string) => string;
  readonly live: string;
  readonly updated: (minutes: number) => string;
  readonly justNow: string;
  readonly waiting: string;
  readonly arrived: (name: string, home: string) => string;
  readonly arrivedLine: string;
  readonly ended: string;
  readonly endedLine: string;
  readonly expired: string;
  readonly expiredLine: string;
  readonly offline: string;
  readonly loading: string;
  readonly map: string;
  readonly you: string;
}

const EN: TrackWords = {
  title: 'Your OneOhm visit',
  away: (name, minutes) => `${name} is about ${minutes} min away`,
  coming: (name) => `${name} is on the way`,
  to: (home) => `Coming to ${home}`,
  live: 'Live',
  updated: (minutes) => `Location from ${minutes} min ago`,
  justNow: 'Location from just now',
  waiting: 'Waiting for the first location.',
  arrived: (name, home) => `${name} has reached ${home}`,
  arrivedLine: 'Your visit has started. The live map is off now.',
  ended: 'This live link has ended',
  endedLine:
    'The map shows only while our team is on the way. Message us on WhatsApp for an update.',
  expired: 'This link does not open',
  expiredLine: 'It may be old or cut short. Message us on WhatsApp for an update.',
  offline: 'Could not refresh. Check your internet; we try again every 20 seconds.',
  loading: 'Finding your visit',
  map: 'Map of the team and your home',
  you: 'Your home',
};

const MR: TrackWords = {
  title: 'तुमची OneOhm भेट',
  away: (name, minutes) => `${name} सुमारे ${minutes} मिनिटांवर आहेत`,
  coming: (name) => `${name} येत आहेत`,
  to: (home) => `${home} येथे येत आहेत`,
  live: 'लाइव्ह',
  updated: (minutes) => `${minutes} मिनिटांपूर्वीचे लोकेशन`,
  justNow: 'आत्ताचे लोकेशन',
  waiting: 'पहिल्या लोकेशनची वाट पाहत आहोत.',
  arrived: (name, home) => `${name} ${home} येथे पोहोचले आहेत`,
  arrivedLine: 'तुमची भेट सुरू झाली आहे. लाइव्ह नकाशा आता बंद आहे.',
  ended: 'ही लाइव्ह लिंक संपली आहे',
  endedLine: 'आमची टीम येत असतानाच नकाशा दिसतो. माहितीसाठी आम्हाला WhatsApp वर मेसेज करा.',
  expired: 'ही लिंक उघडत नाही',
  expiredLine: 'ती जुनी किंवा अपूर्ण असू शकते. माहितीसाठी आम्हाला WhatsApp वर मेसेज करा.',
  offline: 'रिफ्रेश झाले नाही. इंटरनेट तपासा; आम्ही दर 20 सेकंदांनी पुन्हा प्रयत्न करतो.',
  loading: 'तुमची भेट शोधत आहोत',
  map: 'टीम आणि तुमच्या घराचा नकाशा',
  you: 'तुमचे घर',
};

const HI: TrackWords = {
  title: 'आपकी OneOhm विज़िट',
  away: (name, minutes) => `${name} लगभग ${minutes} मिनट दूर हैं`,
  coming: (name) => `${name} आ रहे हैं`,
  to: (home) => `${home} आ रहे हैं`,
  live: 'लाइव',
  updated: (minutes) => `${minutes} मिनट पहले की लोकेशन`,
  justNow: 'अभी की लोकेशन',
  waiting: 'पहली लोकेशन का इंतज़ार है।',
  arrived: (name, home) => `${name} ${home} पहुँच गए हैं`,
  arrivedLine: 'आपकी विज़िट शुरू हो गई है। लाइव नक्शा अब बंद है।',
  ended: 'यह लाइव लिंक खत्म हो गई है',
  endedLine: 'हमारी टीम के आते समय ही नक्शा दिखता है। जानकारी के लिए हमें WhatsApp पर मैसेज करें।',
  expired: 'यह लिंक नहीं खुलती',
  expiredLine: 'यह पुरानी या अधूरी हो सकती है। जानकारी के लिए हमें WhatsApp पर मैसेज करें।',
  offline: 'रिफ्रेश नहीं हुआ। इंटरनेट जाँचें; हम हर 20 सेकंड में फिर कोशिश करते हैं।',
  loading: 'आपकी विज़िट ढूँढ रहे हैं',
  map: 'टीम और आपके घर का नक्शा',
  you: 'आपका घर',
};

export const TRACK_WORDS: Readonly<Record<TrackLanguage, TrackWords>> = { en: EN, mr: MR, hi: HI };
