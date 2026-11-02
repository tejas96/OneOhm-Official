/**
 * Marathi copy for family access: the same shape as `../en/family.ts`.
 *
 * Drafted by the OneOhm team. Have a native Marathi speaker read it once before go-live.
 */
import type { Copy } from '@/i18n/copy';
import type * as en from '../en/family';

export const FAMILY: Copy<typeof en.FAMILY> = {
  cardTitle: 'कुटुंबाला ॲक्सेस',
  cardHint: 'घरच्यांनाही त्यांच्या फोनवरून प्रकल्प पाहू द्या आणि पेमेंट करू द्या.',
  open: 'लोक जोडा किंवा काढा',
  title: 'कुटुंबाला ॲक्सेस',
  intro:
    'तुम्ही जोडलेले लोक स्वतःच्या मोबाईल नंबरने साइन इन करतात आणि तेच प्रकल्प, कागदपत्रे आणि पेमेंट पाहतात. WhatsApp अपडेट्स तुमच्याच नंबरवर येत राहतील.',
  viewerIntro: (owner) =>
    `तुम्ही ${owner} यांच्या कुटुंबातील सदस्य म्हणून साइन इन आहात. लोक जोडणे किंवा काढणे फक्त ${owner} करू शकतात.`,
  empty: 'अजून दुसऱ्या कोणालाही ॲक्सेस नाही.',
  addTitle: 'कुटुंबातील व्यक्ती जोडा',
  name: 'नाव',
  phone: 'मोबाईल नंबर',
  relation: 'नाते',
  relationHint: 'उदा. पत्नी, मुलगा, भाऊ.',
  add: 'जोडा',
  added: (name) => `${name} आता साइन इन करू शकतात.`,
  remove: 'काढा',
  removeLabel: (name) => `${name} यांना काढा`,
  removeAsk: (name) => `${name} यांना काढायचे?`,
  removeAskBody: (name) => `${name} यांना यापुढे साइन इन करून तुमचे प्रकल्प पाहता येणार नाहीत.`,
  removed: (name) => `${name} यांचा ॲक्सेस काढला.`,
  failed: 'ते झाले नाही. कृपया पुन्हा प्रयत्न करा.',
};
