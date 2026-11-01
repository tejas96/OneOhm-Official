import { describe, expect, it } from 'vitest';
import { approvedMessage, templateFor } from './message-templates';

const names = { metaName: 'project_milestone', language: 'en', metaNameMr: 'project_milestone_mr' };

describe('templateFor', () => {
  it('sends the Marathi template to a Marathi customer when it is set up', () => {
    expect(templateFor(names, 'mr-IN')).toEqual({
      name: 'project_milestone_mr',
      language: 'mr',
      local: true,
    });
  });

  it('falls back to English when the language has no template', () => {
    expect(templateFor(names, 'hi-IN')).toEqual({
      name: 'project_milestone',
      language: 'en',
      local: false,
    });
    expect(templateFor({ ...names, metaNameHi: '' }, 'hi-IN').local).toBe(false);
    expect(templateFor(names, undefined).name).toBe('project_milestone');
  });

  it('keeps English for English customers', () => {
    expect(templateFor(names, 'en-IN')).toEqual({
      name: 'project_milestone',
      language: 'en',
      local: false,
    });
  });
});

describe('approvedMessage', () => {
  it('fills a Marathi template with the step name in Marathi', () => {
    const sent = approvedMessage('project_milestone', ['customer', 'milestone'], names, {
      customer: 'Ramesh',
      milestone: 'Net meter fitted',
      step: 'net_meter_installation',
      language: 'mr-IN',
    });
    expect(sent).toEqual({
      name: 'project_milestone_mr',
      language: 'mr',
      parameters: ['Ramesh', 'नेट मीटर बसवला'],
    });
  });

  it('keeps the English words in the English template', () => {
    const sent = approvedMessage('project_milestone', ['milestone'], names, {
      milestone: 'Net meter fitted',
      step: 'net_meter_installation',
      language: 'hi-IN',
    });
    expect(sent.parameters).toEqual(['Net meter fitted']);
  });
});
