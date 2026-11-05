import type { SelfSurveyView } from '@oneohm/api-contracts';
import { type DatabaseExecutor, documents, milestoneCredits } from '@oneohm/database';
import { PHOTO_CAPTION, SURVEY_PHOTOS, type SurveyItem, surveyFacts } from '@oneohm/domain';
import { and, eq, isNull } from 'drizzle-orm';
import { payloadOf, type SurveyAction } from './survey-record';
import { missingOf } from './survey-submit';

const ANSWER_LABEL: Readonly<Record<string, string>> = {
  roof: 'Roof',
  floors: 'Floors',
  shade: 'Shade',
  size: 'Roof size',
  consumer: 'Consumer number',
};

/** The survey as the engineer's panel shows it: words for answers, the photos, what is missing, the credit. */
export async function viewOf(db: DatabaseExecutor, action: SurveyAction): Promise<SelfSurveyView> {
  const payload = payloadOf(action);
  const facts = surveyFacts(payload.answers);
  const words: Record<string, string> = {
    roof: facts.structure_type ?? '',
    floors: facts.site_floors
      ? `${facts.site_floors}${facts.site_floors === '4' ? ' or more' : ''}`
      : '',
    shade: facts.self_survey_shade ?? '',
    size: facts.self_survey_roof_size ?? '',
    consumer: payload.answers.consumer ?? '',
  };
  const photos: SelfSurveyView['photos'] = [];
  for (const item of SURVEY_PHOTOS) {
    const id = payload.photos[item];
    if (!id) continue;
    const [file] = await db
      .select({ name: documents.name })
      .from(documents)
      .where(eq(documents.id, id));
    if (file) photos.push({ item, label: PHOTO_CAPTION[item], documentId: id, name: file.name });
  }
  const [credit] = await db
    .select({ paise: milestoneCredits.amountPaise })
    .from(milestoneCredits)
    .where(
      and(
        eq(milestoneCredits.source, 'self_survey'),
        eq(milestoneCredits.sourceId, action.id),
        isNull(milestoneCredits.reversedAt),
      ),
    );
  return {
    id: action.id,
    status: action.status,
    startedAt: payload.startedAt,
    sentAt: payload.sentAt,
    offerPaise: payload.offerPaise,
    creditPaise: credit?.paise ?? null,
    answers: Object.entries(words)
      .filter(([, value]) => value)
      .map(([item, value]) => ({
        item: item as SurveyItem,
        label: ANSWER_LABEL[item] ?? item,
        value,
      })),
    photos,
    missing: await missingOf(db, action),
    askAgain: [...payload.askAgain],
    canCheck: action.status === 'received',
  };
}
