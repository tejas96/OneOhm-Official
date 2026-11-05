import { describe, expect, it } from 'vitest';
import { surveyFormStart } from '../../self-survey/survey-form-words';
import { SELF_SURVEY_FLOW } from './self-survey.flow';

type Node = { type?: string; children?: Node[]; [key: string]: unknown };
const walk = (nodes: readonly Node[]): Node[] =>
  nodes.flatMap((node) => [node, ...walk(node.children ?? [])]);

describe('the self survey Flow JSON', () => {
  const screens = SELF_SURVEY_FLOW.screens as unknown as {
    id: string;
    data: Record<string, unknown>;
    layout: { children: Node[] };
  }[];

  it('has one PhotoPicker per photo screen, never in a navigate payload, and a terminal last screen', () => {
    const pickers = screens.map(
      (screen) => walk(screen.layout.children).filter((n) => n.type === 'PhotoPicker').length,
    );
    expect(pickers).toEqual([0, 1, 1, 1, 1, 0]);
    expect(screens.map((screen) => screen.id)).toEqual([
      'ROOF',
      'CORNER_A',
      'CORNER_B',
      'METER',
      'BOARD',
      'DETAILS',
    ]);
    const text = JSON.stringify(SELF_SURVEY_FLOW);
    expect(text).toContain('${screen.CORNER_A.form.photo}');
    expect(text).toContain('${screen.BOARD.form.photo}');
    // The photos are read where they were taken; no navigate payload mentions a photo.
    expect(text).not.toMatch(/"navigate"[^}]*form\.photo/);
  });

  it('declares every ${data.x} it uses, and ROOF carries every word the other screens read', () => {
    for (const screen of screens) {
      const used = [...JSON.stringify(screen.layout).matchAll(/\$\{data\.(\w+)\}/g)].map(
        (m) => m[1],
      );
      for (const key of used)
        expect(Object.keys(screen.data), `${screen.id} ${key}`).toContain(key);
    }
    const roof = screens[0]?.data ?? {};
    const read = [
      ...JSON.stringify(SELF_SURVEY_FLOW).matchAll(/\$\{screen\.ROOF\.data\.(\w+)\}/g),
    ].map((m) => m[1]);
    for (const key of read) expect(Object.keys(roof)).toContain(key);
  });

  it('the start data fills every declared key of the first screen', () => {
    for (const asked of [true, false]) {
      const start = surveyFormStart(asked, { actionId: 'x' });
      expect(Object.keys(start.data).sort()).toEqual(Object.keys(screens[0]?.data ?? {}).sort());
      expect(start.screen).toBe('ROOF');
      expect(start.data.ask_consumer).toBe(asked);
    }
  });
});
