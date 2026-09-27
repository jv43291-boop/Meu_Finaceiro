/**
 * Importar extrato. Os três arquivos em fixtures/extrato são FICTÍCIOS e imitam
 * três jeitos comuns de extrato em PDF.
 */
import { describe, expect, it } from 'vitest';

import { rowsFromText } from '../pixReceipt';
import { findSimilarEntry, leadingDate, parseStatement } from '../statement';
import colunas from './fixtures/extrato/colunas.txt?raw';
import dias from './fixtures/extrato/dias.txt?raw';
import sinal from './fixtures/extrato/sinal.txt?raw';

const read = (t: string) => parseStatement(rowsFromText(t), 2020);
const brief = (t: string) => read(t).lines.map((l) => [l.date, l.type, l.amountCents, l.transferLike]);

describe('datas no começo da linha', () => {
  it('vários formatos', () => {
    expect(leadingDate('02/09/2026 Pix', 2020)?.date).toBe('2026-09-02');
    expect(leadingDate('02/09 PIX', 2026)?.date).toBe('2026-09-02');
    expect(leadingDate('02 SET 2026 Total', 2020)).toEqual({ date: '2026-09-02', rest: 'Total' });
    expect(leadingDate('5 set Compra', 2026)?.date).toBe('2026-09-05');
    expect(leadingDate('Pix 02/09', 2026)).toBeNull();
    expect(leadingDate('31/02/2026', 2026)).toBeNull();
  });
});

describe('extratos', () => {
  it('colunas com D/C e saldo: saldo não entra, sinal decide, repetidos ficam separados', () => {
    const s = read(colunas);
    expect(s.from).toBe('2026-09-01');
    expect(s.to).toBe('2026-09-30');
    expect(brief(colunas)).toEqual([
      ['2026-09-02', 'expense', 4590, false],
      ['2026-09-03', 'income', 15000, false],
      ['2026-09-05', 'expense', 1250, false],
      ['2026-09-05', 'expense', 1250, false],
      ['2026-09-10', 'income', 250000, false],
      ['2026-09-15', 'expense', 80000, true], // fatura do cartão
      ['2026-09-20', 'expense', 50000, true], // aplicação
    ]);
    expect(s.lines[0].description).toBe('Pix - Enviado MERCADO EXEMPLO LTDA');
    expect(new Set(s.lines.map((l) => l.key)).size).toBe(s.lines.length);
  });

  it('só as saídas têm "-": valor sem sinal é entrada; ano vem do período', () => {
    const s = read(sinal);
    expect(brief(sinal)).toEqual([
      ['2026-09-02', 'expense', 8000, false],
      ['2026-09-04', 'income', 20000, false],
      ['2026-09-04', 'expense', 15035, false],
      ['2026-09-08', 'expense', 2990, false],
      ['2026-09-12', 'income', 123, false],
      ['2026-09-12', 'income', 3500, false],
    ]);
    expect(s.lines[0]).toMatchObject({ description: 'PIX TRANSF MARIA F', detail: null });
  });

  it('agrupado por dia, sem sinal: palavras decidem; totais do dia não entram', () => {
    const s = read(dias);
    expect(brief(dias)).toEqual([
      ['2026-09-02', 'income', 15000, false],
      ['2026-09-02', 'expense', 4590, false],
      ['2026-09-05', 'expense', 9990, false],
    ]);
    expect(s.lines[2]).toMatchObject({ description: 'LOJA FICTICIA', detail: 'Compra no débito', typeSource: 'keyword' });
  });

  it('sem sinal e sem palavra: fica em aberto (nunca vira gasto sozinho)', () => {
    const s = read('Extrato\n01/09/2026   FULANO EXEMPLO   30,00\n02/09/2026   CICLANO EXEMPLO   40,00');
    expect(s.lines.map((l) => l.type)).toEqual([null, null]);
  });

  it('valor antes de qualquer data é contado como ignorado', () => {
    expect(read('Extrato\nAlgo   10,00\n01/09/2026   Pix enviado X   -5,00').skipped).toBe(1);
  });
});

describe('já lançado', () => {
  const line = read(colunas).lines[0];
  it('mesma linha importada antes, ou mesma data+valor+sentido (ex.: Pix pelo comprovante)', () => {
    const tx = [
      { date: '2026-09-02', amountCents: 4590, type: 'expense', deletedAt: null, externalId: 'E000' },
      { date: '2026-09-01', amountCents: 1, type: 'expense', deletedAt: null, externalId: line.key },
    ];
    expect(findSimilarEntry(tx, line, 'expense')?.externalId).toBe(line.key);
    expect(findSimilarEntry([tx[0]], line, 'expense')?.externalId).toBe('E000');
    expect(findSimilarEntry([tx[0]], line, 'income')).toBeNull();
    expect(findSimilarEntry([{ ...tx[0], deletedAt: '2026-09-03' }], line, 'expense')).toBeNull();
  });
});
