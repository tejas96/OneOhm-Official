import { FLOOR_COUNTS, ROOF_SIZES, ROOF_TYPES, SHADES } from '@oneohm/domain';
import { localized, type Words } from '../whatsapp/assistant/language';
import { SURVEY_SCREEN } from '../whatsapp/forms/self-survey.flow';
import { SURVEY_WORDS } from './survey-words';

/**
 * The words filled into the self-survey form's screens, in the customer's language. Meta's limits:
 * heading 80, TextInput label 20, radio label 30, helper text 80, photo hint 300, Footer 35, radio titles 30.
 */
const EN = {
  roofHeading: 'About your roof',
  roofLabel: 'Roof type',
  floorsLabel: 'Floors in your building',
  next: 'Next',
  photoLabel: 'Photo',
  cornerAHeading: 'Roof corner A',
  cornerAHint: 'Stand safely and photograph one corner of your roof.',
  cornerBHeading: 'Roof corner B',
  cornerBHint: 'Now photograph the opposite corner of your roof.',
  meterHeading: 'Electricity meter',
  meterHint: 'The meter number must be readable in the photo.',
  boardHeading: 'Main switch board',
  boardHint: 'Photograph the board with your main switch.',
  detailsHeading: 'Shade and roof size',
  shadeLabel: 'Shade on your roof',
  sizeLabel: 'Roof size',
  consumerLabel: 'Consumer number',
  consumerHint: 'It is on your electricity bill',
  send: 'Send survey',
};

const MR: Words<typeof EN> = {
  roofHeading: 'तुमच्या छताबद्दल',
  roofLabel: 'छताचा प्रकार',
  floorsLabel: 'इमारतीतील मजले',
  next: 'पुढे',
  photoLabel: 'फोटो',
  cornerAHeading: 'छताचा कोपरा A',
  cornerAHint: 'सुरक्षित उभे राहून छताच्या एका कोपऱ्याचा फोटो घ्या.',
  cornerBHeading: 'छताचा कोपरा B',
  cornerBHint: 'आता छताच्या समोरच्या कोपऱ्याचा फोटो घ्या.',
  meterHeading: 'वीज मीटर',
  meterHint: 'फोटोत मीटर क्रमांक वाचता आला पाहिजे.',
  boardHeading: 'मुख्य स्विच बोर्ड',
  boardHint: 'मुख्य स्विच असलेल्या बोर्डचा फोटो घ्या.',
  detailsHeading: 'सावली आणि छताचा आकार',
  shadeLabel: 'छतावरील सावली',
  sizeLabel: 'छताचा आकार',
  consumerLabel: 'ग्राहक क्रमांक',
  consumerHint: 'तो वीज बिलावर असतो',
  send: 'सर्वे पाठवा',
};

const HI: Words<typeof EN> = {
  roofHeading: 'आपकी छत के बारे में',
  roofLabel: 'छत का प्रकार',
  floorsLabel: 'इमारत में मंज़िलें',
  next: 'आगे',
  photoLabel: 'फ़ोटो',
  cornerAHeading: 'छत का कोना A',
  cornerAHint: 'सुरक्षित खड़े होकर छत के एक कोने की फ़ोटो लें।',
  cornerBHeading: 'छत का कोना B',
  cornerBHint: 'अब छत के सामने वाले कोने की फ़ोटो लें।',
  meterHeading: 'बिजली मीटर',
  meterHint: 'फ़ोटो में मीटर नंबर पढ़ने लायक होना चाहिए।',
  boardHeading: 'मुख्य स्विच बोर्ड',
  boardHint: 'मुख्य स्विच वाले बोर्ड की फ़ोटो लें।',
  detailsHeading: 'छाया और छत का आकार',
  shadeLabel: 'छत पर छाया',
  sizeLabel: 'छत का आकार',
  consumerLabel: 'उपभोक्ता नंबर',
  consumerHint: 'यह बिजली बिल पर होता है',
  send: 'सर्वे भेजें',
};

export const SURVEY_FORM_LISTS = { en: EN, mr: MR, hi: HI };
const FORM = localized(EN, { mr: MR, hi: HI });

const titles = (ids: readonly string[], of: Readonly<Record<string, string>>) =>
  ids.map((id) => ({ id, title: of[id] ?? id }));

/** The start of the self-survey form: message, button, first screen and the words and options in it. */
export function surveyFormStart(askConsumer: boolean, payload: Record<string, unknown>) {
  const o = SURVEY_WORDS.options;
  const data = {
    roof_heading: FORM.roofHeading,
    roof_label: FORM.roofLabel,
    floors_label: FORM.floorsLabel,
    next: FORM.next,
    photo_label: FORM.photoLabel,
    corner_a_heading: FORM.cornerAHeading,
    corner_a_hint: FORM.cornerAHint,
    corner_b_heading: FORM.cornerBHeading,
    corner_b_hint: FORM.cornerBHint,
    meter_heading: FORM.meterHeading,
    meter_hint: FORM.meterHint,
    board_heading: FORM.boardHeading,
    board_hint: FORM.boardHint,
    details_heading: FORM.detailsHeading,
    shade_label: FORM.shadeLabel,
    size_label: FORM.sizeLabel,
    consumer_label: FORM.consumerLabel,
    consumer_hint: FORM.consumerHint,
    send: FORM.send,
  };
  return {
    body: SURVEY_WORDS.formBody,
    button: SURVEY_WORDS.formButton,
    screen: SURVEY_SCREEN,
    data: {
      ...data,
      roof_options: titles(ROOF_TYPES, o.roof),
      floors_options: titles(FLOOR_COUNTS, o.floors),
      shade_options: titles(SHADES, o.shade),
      size_options: titles(ROOF_SIZES, o.size),
      ask_consumer: askConsumer,
    },
    payload,
  };
}
