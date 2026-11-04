/**
 * The Marathi and Hindi wording of the "Send to customer" templates and the titles of their
 * quick-reply buttons, as submitted to Meta (docs/whatsapp-templates.md 25-30). The staff preview
 * shows these when the chat is closed, so they see the message the customer will read. English is
 * the template's own `preview`.
 */
export interface SendTemplateWords {
  readonly mr: string;
  readonly hi: string;
  readonly buttons: {
    readonly en: readonly string[];
    readonly mr: readonly string[];
    readonly hi: readonly string[];
  };
}

export const SEND_TEMPLATE_WORDS: Readonly<Record<string, SendTemplateWords>> = {
  location_request: {
    mr: 'नमस्कार {{1}}, तुमच्या {{2}} घराचे लोकेशन पाठवा, म्हणजे आमची टीम सहज पोहोचेल. पाठवण्यासाठी खालील बटण दाबा.',
    hi: 'नमस्ते {{1}}, कृपया अपने {{2}} घर की लोकेशन भेजें, ताकि हमारी टीम आसानी से पहुँच सके। भेजने के लिए नीचे का बटन दबाएँ।',
    buttons: { en: ['Send location'], mr: ['लोकेशन पाठवा'], hi: ['लोकेशन भेजें'] },
  },
  payment_due: {
    mr: 'नमस्कार {{1}}, तुमच्या {{3}} घरासाठी {{2}} बाकी आहे. तुम्ही ऑनलाइन भरू शकता, किंवा दुसऱ्या मार्गाने भरले असल्यास आम्हाला सांगा.',
    hi: 'नमस्ते {{1}}, आपके {{3}} घर के लिए {{2}} बाकी है। आप ऑनलाइन भर सकते हैं, या किसी और तरीके से भरा हो तो हमें बताएँ।',
    buttons: {
      en: ['Pay now', 'I paid another way'],
      mr: ['आता भरा', 'दुसऱ्या मार्गे भरले'],
      hi: ['अभी भरें', 'दूसरे तरीके से भरा'],
    },
  },
  callback_request: {
    mr: 'नमस्कार {{1}}, OneOhm चे {{2}} यांनी तुम्हाला कधी फोन करावा? खाली वेळ निवडा.',
    hi: 'नमस्ते {{1}}, OneOhm से {{2}} आपको कब फ़ोन करें? नीचे समय चुनें।',
    buttons: {
      en: ['Morning', 'Afternoon', 'Evening'],
      mr: ['सकाळी', 'दुपारी', 'संध्याकाळी'],
      hi: ['सुबह', 'दोपहर', 'शाम'],
    },
  },
  delay_notice: {
    mr: 'नमस्कार {{1}}, तुमचे {{2}} थांबले आहे: {{3}}. पुढची माहिती आम्ही इथे कळवू.',
    hi: 'नमस्ते {{1}}, आपका {{2}} रुका हुआ है: {{3}}। आगे की जानकारी हम यहीं देंगे।',
    buttons: { en: [], mr: [], hi: [] },
  },
  crew_contact: {
    mr: 'नमस्कार {{1}}, OneOhm चे {{2}} तुमच्या {{3}} साठी येतील. तुम्ही त्यांना {{4}} वर फोन करू शकता.',
    hi: 'नमस्ते {{1}}, OneOhm से {{2}} आपके {{3}} के लिए आएँगे। आप उन्हें {{4}} पर फ़ोन कर सकते हैं।',
    buttons: { en: [], mr: [], hi: [] },
  },
  document_share: {
    mr: 'नमस्कार {{1}}, तुमचे {{2}} OneOhm कडून येथे आहे. काही प्रश्न असल्यास इथे कळवा.',
    hi: 'नमस्ते {{1}}, आपका {{2}} OneOhm की ओर से यहाँ है। कोई सवाल हो तो यहीं लिखें।',
    buttons: { en: [], mr: [], hi: [] },
  },
};
