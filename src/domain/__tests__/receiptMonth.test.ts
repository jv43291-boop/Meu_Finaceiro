import { describe, expect, it } from 'vitest';

import { receiptWhen } from '../receiptMonth';

// "hoje" fixo: 27/09/2026
const today = '2026-09-27';

describe('em que mês o comprovante entra', () => {
  it('Pix de setembro entra em setembro', () => {
    expect(receiptWhen('2026-09-01', today)).toMatchObject({ kind: 'current', month: '2026-09' });
    expect(receiptWhen('2026-09-27', today)).toMatchObject({ kind: 'current', month: '2026-09' });
  });
  it('Pix de agosto lido em setembro entra em agosto', () => {
    expect(receiptWhen('2026-08-31', today)).toMatchObject({ kind: 'past', month: '2026-08', monthsAgo: 1, old: false });
  });
  it('virada de ano: dezembro lido em janeiro entra em dezembro', () => {
    expect(receiptWhen('2025-12-30', '2026-01-02')).toMatchObject({ kind: 'past', month: '2025-12', monthsAgo: 1 });
  });
  it('mais de 3 meses atrás: entra no mês dele, com aviso', () => {
    expect(receiptWhen('2026-05-10', today)).toMatchObject({ kind: 'past', month: '2026-05', monthsAgo: 4, old: true });
  });
  it('sem data: não vira "hoje"', () => {
    expect(receiptWhen(null, today)).toEqual({ kind: 'missing' });
  });
  it('data depois de hoje: aviso de erro de leitura', () => {
    expect(receiptWhen('2026-09-28', today)).toMatchObject({ kind: 'future', month: '2026-09' });
  });
});
