import { describe, expect, it } from 'vitest';
import { dictationLanguage, joinSpoken, problemOf } from './dictation-text';

describe('joinSpoken', () => {
  it('starts an empty note with a capital letter', () => {
    expect(joinSpoken('', 'structure fixed on the east side')).toBe(
      'Structure fixed on the east side',
    );
    expect(joinSpoken('   ', ' panels tomorrow ')).toBe('Panels tomorrow');
  });

  it('adds after what is typed, with one space', () => {
    expect(joinSpoken('Earthing done', 'meter next')).toBe('Earthing done meter next');
    expect(joinSpoken('Earthing done ', 'meter next')).toBe('Earthing done meter next');
    expect(joinSpoken('Line one\n', 'line two')).toBe('Line one\nline two');
  });

  it('starts a new sentence after a full stop, question mark or danda', () => {
    expect(joinSpoken('Earthing done.', 'meter next')).toBe('Earthing done. Meter next');
    expect(joinSpoken('Is the bill ready? ', 'ask tomorrow')).toBe(
      'Is the bill ready? Ask tomorrow',
    );
    expect(joinSpoken('काम झाले।', 'उद्या मीटर')).toBe('काम झाले। उद्या मीटर');
  });

  it('keeps the note as it is when nothing was heard, and tidies spaces', () => {
    expect(joinSpoken('Earthing done', '   ')).toBe('Earthing done');
    expect(joinSpoken('', 'two   spaces')).toBe('Two spaces');
  });
});

describe('dictationLanguage', () => {
  it('follows a Marathi or Hindi phone, else English (India)', () => {
    expect(dictationLanguage('mr-IN')).toBe('mr-IN');
    expect(dictationLanguage('mr')).toBe('mr-IN');
    expect(dictationLanguage('hi_IN')).toBe('hi-IN');
    expect(dictationLanguage('en-US')).toBe('en-IN');
    expect(dictationLanguage('ta-IN')).toBe('en-IN');
    expect(dictationLanguage(null)).toBe('en-IN');
  });
});

describe('problemOf', () => {
  it('says nothing when the person stopped it, and names the rest calmly', () => {
    expect(problemOf('aborted')).toBeNull();
    expect(problemOf('no-speech')).toBe('noSpeech');
    expect(problemOf('speech-timeout')).toBe('noSpeech');
    expect(problemOf('not-allowed')).toBe('denied');
    expect(problemOf('network')).toBe('offline');
    expect(problemOf('audio-capture')).toBe('failed');
  });
});
