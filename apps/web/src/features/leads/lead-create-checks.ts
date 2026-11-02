import { type CheckKey, followUpProblem, isIndianMobile } from '@/lib/forms/checks';

/** What the form checks before sending; the API checks again. */
export function leadProblems(values: {
  readonly name: string;
  readonly phone: string;
  readonly city: string;
  readonly nextActionOn: string;
  readonly nextActionTime: string;
  readonly badKw: boolean;
}): Record<string, CheckKey | 'minChars'> {
  const found: Record<string, CheckKey | 'minChars'> = {};
  if (values.name.length < 2) found.name = 'minChars';
  if (!values.phone.trim()) found.phone = 'required';
  else if (!isIndianMobile(values.phone)) found.phone = 'mobile';
  if (values.city.length < 2) found.city = 'minChars';
  const followUp = followUpProblem(values.nextActionOn, values.nextActionTime || null);
  if (followUp) found[followUp.field === 'date' ? 'nextActionOn' : 'nextActionTime'] = followUp.key;
  if (values.badKw) found.estimatedWp = 'positiveNumber';
  return found;
}
