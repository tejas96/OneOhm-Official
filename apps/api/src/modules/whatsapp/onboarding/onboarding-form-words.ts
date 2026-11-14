import { type OnboardingSettings, usableName } from '@oneohm/domain';
import { titleCaseName } from '@oneohm/shared';
import { localized, type Words } from '../assistant/language';
import type { FormStart } from '../forms/form-send';
import { ONBOARDING_SCREEN, OTHER_CITY_OPTION } from '../forms/onboarding.flow';
import { ONBOARD_WORDS } from './onboard-words';
import { bandLabel } from './onboarding-replies';

/**
 * The words filled into the onboarding form, in the customer's language. Meta's limits: heading 80, TextInput
 * label 20, helper text 80, radio label and option title 30, photo hint 300, Footer 35, message button 30,
 * message body 1024 (onboarding-form.test.ts checks every language). Site, roof, floors and "other city"
 * titles come from the chat's own words, so the form and the chat say the same.
 */
const EN = {
  button: 'Open form',
  body: 'Thank you! Please tell us about your home in this short form — you will get your solar estimate right after.\n\nOr just answer here in the chat.',
  /** Said in plain words if the form cannot be delivered. */
  fallback: 'Please type your name.',
  heading: 'Tell us about your home',
  nameLabel: 'Your name',
  cityLabel: 'Which city?',
  otherCityLabel: 'Other city',
  otherCityHint: 'Only if your city is not in the list',
  siteLabel: 'Where do you want solar?',
  billLabel: 'Monthly electricity bill',
  roofLabel: 'What is the roof like?',
  floorsLabel: 'How many floors?',
  photoLabel: 'Photo of your bill',
  photoHint: 'Optional. Or send a PDF in the chat after.',
  send: 'Get my estimate',
};

const MR: Words<typeof EN> = {
  button: 'फॉर्म उघडा',
  body: 'धन्यवाद! कृपया या छोट्या फॉर्ममध्ये तुमच्या घराची माहिती द्या — लगेच तुम्हाला सोलर अंदाज मिळेल.\n\nकिंवा इथे चॅटमध्येच उत्तर द्या.',
  fallback: 'कृपया तुमचे नाव लिहा.',
  heading: 'तुमच्या घराबद्दल सांगा',
  nameLabel: 'तुमचे नाव',
  cityLabel: 'कोणते शहर?',
  otherCityLabel: 'दुसरे शहर',
  otherCityHint: 'तुमचे शहर यादीत नसेल तरच',
  siteLabel: 'सोलर कुठे बसवायचे आहे?',
  billLabel: 'महिन्याचे वीज बिल',
  roofLabel: 'छत कसे आहे?',
  floorsLabel: 'किती मजले?',
  photoLabel: 'बिलाचा फोटो',
  photoHint: 'ऐच्छिक. किंवा PDF नंतर चॅटमध्ये पाठवा.',
  send: 'माझा अंदाज मिळवा',
};

const HI: Words<typeof EN> = {
  button: 'फ़ॉर्म खोलें',
  body: 'धन्यवाद! कृपया इस छोटे फ़ॉर्म में अपने घर की जानकारी दें — तुरंत आपको सोलर अनुमान मिलेगा।\n\nया यहीं चैट में जवाब दें।',
  fallback: 'कृपया अपना नाम लिखें।',
  heading: 'अपने घर के बारे में बताएँ',
  nameLabel: 'आपका नाम',
  cityLabel: 'कौन सा शहर?',
  otherCityLabel: 'दूसरा शहर',
  otherCityHint: 'सिर्फ़ अगर आपका शहर सूची में नहीं है',
  siteLabel: 'सोलर कहाँ लगवाना है?',
  billLabel: 'महीने का बिजली बिल',
  roofLabel: 'छत कैसी है?',
  floorsLabel: 'कितनी मंज़िल?',
  photoLabel: 'बिल की फ़ोटो',
  photoHint: 'वैकल्पिक. या PDF बाद में चैट में भेजें।',
  send: 'मेरा अनुमान पाएँ',
};

/** Every language, for the limit checks. */
export const ONBOARD_FORM_LISTS = { en: EN, mr: MR, hi: HI };
const FORM = localized(EN, { mr: MR, hi: HI });

const title = (text: string) => ({ title: text.slice(0, 30) });

/**
 * The start of the onboarding form, in the language being spoken: its message, the choices (the owner's
 * cities and bill bands, then the chat's own site, roof and floors words) and the WhatsApp name to offer.
 */
export function onboardingFormStart(
  settings: OnboardingSettings,
  profileName: string | null,
  payload: Record<string, unknown> = {},
): FormStart {
  const W = ONBOARD_WORDS;
  const name = usableName(profileName);
  return {
    body: FORM.body,
    button: FORM.button,
    screen: ONBOARDING_SCREEN,
    data: {
      heading: FORM.heading,
      name_label: FORM.nameLabel,
      name_init: name ? titleCaseName(name) : '',
      city_label: FORM.cityLabel,
      other_city_label: FORM.otherCityLabel,
      other_city_hint: FORM.otherCityHint,
      site_label: FORM.siteLabel,
      bill_label: FORM.billLabel,
      roof_label: FORM.roofLabel,
      floors_label: FORM.floorsLabel,
      photo_label: FORM.photoLabel,
      photo_hint: FORM.photoHint,
      send: FORM.send,
      city_options: [
        ...settings.serviceCities.map((city) => ({ id: city, ...title(city) })),
        { id: OTHER_CITY_OPTION, ...title(W.otherCity) },
      ],
      site_options: (['home', 'society', 'business', 'farm'] as const).map((id) => ({
        id,
        ...title(W.sites[id]),
      })),
      bill_options: settings.billBands.map((band) => ({ id: band.id, ...title(bandLabel(band)) })),
      roof_options: (['rcc', 'tin', 'other'] as const).map((id) => ({
        id,
        ...title(W.roofs[id]),
      })),
      floors_options: ([1, 2, 3] as const).map((id) => ({
        id: String(id),
        ...title(W.floors[id]),
      })),
    },
    payload,
  };
}

/** What goes in the chat if the form cannot be delivered. */
export const onboardingFormFallback = () => FORM.fallback;
