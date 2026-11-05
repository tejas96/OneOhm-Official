const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const TAP = new RegExp(`^ss:(go|visit|new|vnew):(${UUID})$`);
const ANSWER = new RegExp(`^ss:ans:(${UUID}):(roof|floors|shade|size):([a-z0-9]{1,10})$`);

/** A tap on a button or row of the self-survey messages (redesign §7). */
export type SurveyTap =
  /** [Start survey] / [Continue]: of an ask. */
  | { readonly t: 'go'; readonly id: string }
  /** [Book a visit instead]: of an ask. */
  | { readonly t: 'visit'; readonly id: string }
  /** From Home, no ask yet: of the survey task. */
  | { readonly t: 'new'; readonly id: string }
  | { readonly t: 'vnew'; readonly id: string }
  | {
      readonly t: 'answer';
      readonly id: string;
      readonly question: string;
      readonly value: string;
    };

export function readSurveyTap(id: string | null | undefined): SurveyTap | null {
  if (!id) return null;
  const match = TAP.exec(id);
  if (match) return { t: match[1] as 'go', id: match[2] as string };
  const answer = ANSWER.exec(id);
  if (!answer) return null;
  return {
    t: 'answer',
    id: answer[1] as string,
    question: answer[2] as string,
    value: answer[3] as string,
  };
}

export const isSurveyTap = (id: string) => readSurveyTap(id) !== null;

export const startTap = (actionId: string) => `ss:go:${actionId}`;
export const visitTap = (actionId: string) => `ss:visit:${actionId}`;
export const newTap = (taskId: string) => `ss:new:${taskId}`;
export const newVisitTap = (taskId: string) => `ss:vnew:${taskId}`;
export const answerTap = (actionId: string, question: string, value: string) =>
  `ss:ans:${actionId}:${question}:${value}`;
