/**
 * The app-inbox words of the site visit messages (Duty Day step 6), in English, Marathi and Hindi.
 * Off WhatsApp the same words go as the SMS (none point to the chat), except "Was this visit
 * done?", which is never an SMS. Drafted by the OneOhm team; have a native speaker read them once.
 */
type Payload = Readonly<Record<string, string>>;
type Words = (payload: Payload) => { readonly title: string; readonly body: string };

export const DUTY_MESSAGES = [
  'worker_on_way',
  'worker_arrived',
  'visit_check',
  'visit_delayed',
] as const;
export type DutyMessage = (typeof DUTY_MESSAGES)[number];

export const DUTY_EN: Readonly<Record<DutyMessage, Words>> = {
  worker_on_way: (p) => ({
    title: `${p.worker} from OneOhm is on the way to ${p.home}`,
    body: `Expected in about ${p.minutes} min.`,
  }),
  worker_arrived: (p) => ({
    title: `${p.worker} from OneOhm has reached ${p.home}`,
    body: 'Our team is at your site now.',
  }),
  visit_check: (p) => ({
    title: `Did ${p.worker} visit ${p.home} today?`,
    body: 'Tell us in our WhatsApp chat.',
  }),
  visit_delayed: (p) => ({
    title: 'Our team is running late',
    body: `For your visit to ${p.home}. We will update you soon.`,
  }),
};

export const DUTY_MR: Readonly<Record<DutyMessage, Words>> = {
  worker_on_way: (p) => ({
    title: `OneOhm चे ${p.worker} ${p.home} येथे येण्यासाठी निघाले आहेत`,
    body: `सुमारे ${p.minutes} मिनिटांत पोहोचतील.`,
  }),
  worker_arrived: (p) => ({
    title: `OneOhm चे ${p.worker} ${p.home} येथे पोहोचले आहेत`,
    body: 'आमची टीम आता तुमच्या साइटवर आहे.',
  }),
  visit_check: (p) => ({
    title: `${p.worker} आज ${p.home} येथे आले होते का?`,
    body: 'आमच्या WhatsApp चॅटमध्ये सांगा.',
  }),
  visit_delayed: (p) => ({
    title: 'आमच्या टीमला उशीर होत आहे',
    body: `${p.home} येथील तुमच्या भेटीसाठी. आम्ही लवकरच कळवू.`,
  }),
};

export const DUTY_HI: Readonly<Record<DutyMessage, Words>> = {
  worker_on_way: (p) => ({
    title: `OneOhm से ${p.worker} ${p.home} के लिए निकल चुके हैं`,
    body: `लगभग ${p.minutes} मिनट में पहुँचेंगे।`,
  }),
  worker_arrived: (p) => ({
    title: `OneOhm से ${p.worker} ${p.home} पर पहुँच गए हैं`,
    body: 'हमारी टीम अभी आपकी साइट पर है।',
  }),
  visit_check: (p) => ({
    title: `क्या ${p.worker} आज ${p.home} पर आए थे?`,
    body: 'हमारे WhatsApp चैट में बताएँ।',
  }),
  visit_delayed: (p) => ({
    title: 'हमारी टीम को देर हो रही है',
    body: `${p.home} पर आपकी विज़िट के लिए। हम जल्द ही बताएँगे।`,
  }),
};
