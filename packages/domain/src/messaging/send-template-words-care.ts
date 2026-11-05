import type { SendTemplateWords } from './send-template-words';

/** Marathi and Hindi wording and button titles of the problem, reward and AMC templates (docs 53-55). */
export const CARE_TEMPLATE_WORDS: Readonly<Record<string, SendTemplateWords>> = {
  problem_fixed_check: {
    mr: 'नमस्कार {{1}}, "{{2}}" आम्ही दुरुस्त केले आहे. आता ते नीट चालते का? सांगण्यासाठी बटण दाबा.',
    hi: 'नमस्ते {{1}}, "{{2}}" हमने ठीक कर दिया है। क्या अब यह ठीक चल रहा है? बताने के लिए बटन दबाएँ।',
    buttons: {
      en: ['Yes, working', 'Still a problem'],
      mr: ['हो, चालू आहे', 'अजून अडचण आहे'],
      hi: ['हाँ, चालू है', 'अभी भी समस्या है'],
    },
  },
  reward_upi_ask: {
    mr: 'नमस्कार {{1}}, तुमचे OneOhm रेफरल बक्षीस {{2}} मंजूर झाले आहे. ते मिळवण्यासाठी तुमचा UPI आयडी द्या.',
    hi: 'नमस्ते {{1}}, आपका OneOhm रेफरल इनाम {{2}} मंज़ूर हो गया है। इसे पाने के लिए अपना UPI आईडी दें।',
    buttons: {
      en: ['Share UPI ID'],
      mr: ['UPI आयडी द्या'],
      hi: ['UPI आईडी दें'],
    },
  },
  amc_renewal_offer: {
    mr: 'नमस्कार {{1}}, तुमच्या {{2}} सोलरची वार्षिक देखभाल योजना {{3}} रोजी संपते. मोफत भेटी आणि सफाई चालू ठेवण्यासाठी ती नूतनीकरण करा.',
    hi: 'नमस्ते {{1}}, आपके {{2}} सोलर की सालाना देखरेख योजना {{3}} को खत्म होती है। मुफ़्त विज़िट और सफ़ाई जारी रखने के लिए इसे रिन्यू करें।',
    buttons: {
      en: ['Renew AMC', 'Talk to us'],
      mr: ['AMC नूतनीकरण', 'आमच्याशी बोला'],
      hi: ['AMC रिन्यू करें', 'हमसे बात करें'],
    },
  },
};
