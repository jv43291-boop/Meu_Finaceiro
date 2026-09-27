import { describe, expect, it } from 'vitest';

import { hpSegments, xpSegments } from '../gamer';

describe('HP do orçamento', () => {
  it('cheio sem gasto, esvazia com o gasto, zera ao estourar', () => {
    expect(hpSegments(0)).toBe(10);
    expect(hpSegments(0.25)).toBe(8);
    expect(hpSegments(0.8)).toBe(2);
    expect(hpSegments(0.999)).toBe(1); // sobrou pouco: ainda tem vida
    expect(hpSegments(1)).toBe(0);
    expect(hpSegments(1.4)).toBe(0);
  });
  it('valor estranho não quebra', () => {
    expect(hpSegments(Number.NaN)).toBe(10);
    expect(hpSegments(-1)).toBe(10);
  });
});

describe('XP da meta', () => {
  it('enche com o guardado; cheio só quando concluída', () => {
    expect(xpSegments(0)).toBe(0);
    expect(xpSegments(0.35)).toBe(3);
    expect(xpSegments(0.99)).toBe(9);
    expect(xpSegments(1)).toBe(10);
    expect(xpSegments(2)).toBe(10);
    expect(xpSegments(Number.NaN)).toBe(0);
  });
});
