/**
 * Comprovantes de Pix por banco. Os arquivos em fixtures/pix imitam a ESTRUTURA
 * dos comprovantes reais de cada app (enviados pelo João em 26/09/2026), com
 * nomes, valores, documentos e IDs inventados.
 */
import { describe, expect, it } from 'vitest';

import { parsePixReceipt, rowsFromText } from '../pixReceipt';
import bb from './fixtures/pix/bb.txt?raw';
import itau from './fixtures/pix/itau.txt?raw';
import nubank from './fixtures/pix/nubank.txt?raw';
import picpay from './fixtures/pix/picpay.txt?raw';

const FIXTURES: Record<string, string> = { bb, itau, nubank, picpay };
const read = (bank: string) => parsePixReceipt(rowsFromText(FIXTURES[bank]));

describe('comprovantes por banco', () => {
  it('Banco do Brasil: valor sem rótulo, "Recebedor"/"Pagador", ID no rodapé, 2ª data é a de emissão', () => {
    expect(read('bb')).toEqual({
      amountCents: 18740, counterpartName: 'Carlos T Exemplo', counterpartDoc: '111222',
      date: '2026-08-05', time: '20:15', pixId: 'E00000001202608052315aB12cD34eF5',
      direction: 'sent', directionSource: 'keyword', payer: { name: 'Carlos T Exemplo', doc: '111222' }, payee: { name: 'Carlos T Exemplo', doc: '111222' }, bank: 'Banco do Brasil', looksLikePix: true, looksLikeStatement: false, ownTransfer: true,
    });
  });

  it('Itaú: "De" antes de "Para", CPF sem pontos, autenticação que não é o ID do Pix', () => {
    expect(read('itau')).toEqual({
      amountCents: 25000, counterpartName: 'Maria Ficticia Souza', counterpartDoc: '333444',
      date: '2026-08-12', time: '14:05', pixId: 'E00000002202608121705XY12ZW34QRS',
      direction: 'sent', directionSource: 'default', payer: { name: 'Carlos Teste Exemplo', doc: '111222' }, payee: { name: 'Maria Ficticia Souza', doc: '333444' }, bank: 'Itaú', looksLikePix: true, looksLikeStatement: false, ownTransfer: false,
    });
  });

  it('PicPay: data "03/ago/2026 - 101530", nome em duas linhas, ID quebrado', () => {
    expect(read('picpay')).toEqual({
      amountCents: 9500, counterpartName: 'ANA PAULA FICTICIA DOS SANTOS', counterpartDoc: '555666',
      date: '2026-08-03', time: '10:15', pixId: 'E00000003202608031315aa11bb22cc3',
      direction: 'sent', directionSource: 'default', payer: { name: 'Carlos Teste Exemplo', doc: '111222' }, payee: { name: 'ANA PAULA FICTICIA DOS SANTOS', doc: '555666' }, bank: 'PicPay', looksLikePix: true, looksLikeStatement: false, ownTransfer: false,
    });
  });

  it('Nubank: duas colunas, "Destino"/"Origem", CPF com •, valor com milhar', () => {
    expect(read('nubank')).toEqual({
      amountCents: 102075, counterpartName: 'Carlos Teste Exemplo', counterpartDoc: '111222',
      date: '2026-08-18', time: '11:22', pixId: 'E00000004202608181133z000a1b2c3d',
      direction: 'sent', directionSource: 'default', payer: { name: 'Carlos Teste Exemplo', doc: '111222' }, payee: { name: 'Carlos Teste Exemplo', doc: '111222' }, bank: 'Nubank', looksLikePix: true, looksLikeStatement: false, ownTransfer: true,
    });
  });

  it('PicPay: hora com o símbolo de ":" da fonte do PDF', () => {
    const text = FIXTURES.picpay.replace('03/ago/2026 - 101530', '03/ago/2026 - 10\uE09215\uE09230');
    expect(parsePixReceipt(rowsFromText(text)).time).toBe('10:15');
  });
  it('a data "05/09/2026" nunca vira hora', () => {
    expect(parsePixReceipt(rowsFromText('Pix\nR$ 1,00\n05/09/2026\nPara ANA EXEMPLO')).time).toBeNull();
  });
  it('extrato do mês não é lido como um comprovante só (FICTÍCIO)', () => {
    const extrato = [
      'Extrato de conta corrente', 'Período de 01/09/2026 a 30/09/2026', 'Saldo anterior   R$ 1.000,00',
      '02/09/2026   Pix enviado MERCADO EXEMPLO   -45,90', '03/09/2026   Pix recebido ANA EXEMPLO   150,00',
      '05/09/2026   Compra no débito PADARIA FICTICIA   -12,50', '10/09/2026   Salário EMPRESA FICTICIA   2.500,00',
      '15/09/2026   Pagamento de boleto   -320,00', 'Saldo final   R$ 3.271,60',
    ].join('\n');
    expect(parsePixReceipt(rowsFromText(extrato)).looksLikeStatement).toBe(true);
    for (const t of Object.values(FIXTURES)) expect(parsePixReceipt(rowsFromText(t)).looksLikeStatement).toBe(false);
  });
});
