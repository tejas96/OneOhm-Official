import type { SendTemplateWords } from './send-template-words';

/**
 * Marathi and Hindi wording and button titles of the site visit templates (docs 57-60). Drafted by
 * the OneOhm team; have a native speaker read them once before submitting to Meta.
 */
export const DUTY_TEMPLATE_WORDS: Readonly<Record<string, SendTemplateWords>> = {
  worker_on_way: {
    mr: 'नमस्कार {{1}}, OneOhm चे {{2}} {{3}} येथे येण्यासाठी निघाले आहेत. सुमारे {{4}} मिनिटांत पोहोचतील.',
    hi: 'नमस्ते {{1}}, OneOhm से {{2}} {{3}} के लिए निकल चुके हैं। लगभग {{4}} मिनट में पहुँचेंगे।',
    buttons: { en: ['Track live'], mr: ['लाइव्ह पाहा'], hi: ['लाइव देखें'] },
  },
  worker_arrived: {
    mr: 'नमस्कार {{1}}, OneOhm चे {{2}} {{3}} येथे पोहोचले आहेत.',
    hi: 'नमस्ते {{1}}, OneOhm से {{2}} {{3}} पर पहुँच गए हैं।',
    buttons: { en: [], mr: [], hi: [] },
  },
  visit_check: {
    mr: 'नमस्कार {{1}}, OneOhm चे {{2}} आज {{3}} येथे आले होते. ही भेट झाली का?',
    hi: 'नमस्ते {{1}}, OneOhm से {{2}} आज {{3}} पर आए थे। क्या यह विज़िट हुई?',
    buttons: {
      en: ['Yes, visited', 'No'],
      mr: ['हो, आले होते', 'नाही'],
      hi: ['हाँ, आए थे', 'नहीं'],
    },
  },
  visit_delayed: {
    mr: 'नमस्कार {{1}}, {{2}} येथील तुमच्या भेटीसाठी आमच्या टीमला उशीर होत आहे. आम्ही लवकरच कळवू.',
    hi: 'नमस्ते {{1}}, {{2}} पर आपकी विज़िट के लिए हमारी टीम को देर हो रही है। हम जल्द ही बताएँगे।',
    buttons: { en: [], mr: [], hi: [] },
  },
};
