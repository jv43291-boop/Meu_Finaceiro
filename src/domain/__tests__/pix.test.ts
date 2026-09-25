import { describe, expect, it } from 'vitest';

import { findDuplicatePix, findPayeeRule, normalizeName, upsertPayeeRule } from '../payeeRules';
import { parseDateBR, parseMoneyBR, parsePixReceipt, rowsFromText, toRows, type TextLine } from '../pixReceipt';
import type { PayeeRule } from '../types';

// Todos os comprovantes abaixo são FICTÍCIOS (nomes, documentos e IDs inventados).
const E2E = 'E12345678202609251432Ab12Cd34Ef5';

describe('valores e datas', () => {
  it('lê dinheiro no formato brasileiro', () => {
    expect(parseMoneyBR('R$ 1.234,56')).toBe(123456);
    expect(parseMoneyBR('R$8,50')).toBe(850);
    expect(parseMoneyBR('RS 12,00')).toBe(1200); // OCR trocou $ por S
    expect(parseMoneyBR('- R$ 50,00')).toBe(5000);
    expect(parseMoneyBR('Valor 30,00')).toBeNull();
    expect(parseMoneyBR('Valor 30,00', true)).toBe(3000);
  });
  it('lê datas em vários formatos', () => {
    expect(parseDateBR('25/09/2026 - 14:32')).toBe('2026-09-25');
    expect(parseDateBR('Qui, 25 set 2026')).toBe('2026-09-25');
    expect(parseDateBR('25 de setembro de 2026')).toBe('2026-09-25');
    expect(parseDateBR('31/02/2026')).toBeNull();
  });
});

describe('remonta linhas pela posição', () => {
  it('junta rótulo e valor que estão na mesma altura', () => {
    const l = (text: string, x: number, y: number): TextLine => ({ text, x, y, width: 200, height: 30 });
    // o OCR devolve a coluna da esquerda inteira e depois a da direita
    const rows = toRows([l('Valor', 20, 100), l('Para', 20, 150), l('R$ 8,50', 500, 102), l('JOSE RIBEIRO', 500, 148)]);
    expect(rows).toEqual([['Valor', 'R$ 8,50'], ['Para', 'JOSE RIBEIRO']]);
  });
});

describe('comprovantes', () => {
  it('duas colunas (rótulo | valor)', () => {
    const r = parsePixReceipt(rowsFromText(`
      Comprovante de transferência
      Pix enviado
      Valor        R$ 8,50
      Data         25/09/2026 às 07:41
      Para         JOSE RIBEIRO
      CPF          ***.456.789-**
      Instituição  BANCO FICTICIO S.A.
      De           JOAO TESTE
      ID da transação   ${E2E}
    `));
    expect(r).toMatchObject({
      amountCents: 850, counterpartName: 'JOSE RIBEIRO', counterpartDoc: '456789', date: '2026-09-25', time: '07:41', pixId: E2E,
      direction: 'sent', looksLikePix: true,
    });
  });

  it('seção "Destino" com "Nome" na linha de baixo e valor em destaque no topo', () => {
    const r = parsePixReceipt(rowsFromText(`
      Nu Pagamentos
      Comprovante de transferência
      25 SET 2026 - 18:03:10
      R$ 23,90
      Tipo de transferência
      Pix
      Destino
      Nome
      Padaria Pão Quente Ltda
      CNPJ
      12.345.678/0001-90
      Instituição
      Banco Exemplo
      Origem
      Nome
      Joao Teste
      ID da transação:
      ${E2E.slice(0, 16)}
      ${E2E.slice(16)}
    `));
    expect(r.amountCents).toBe(2390);
    expect(r.counterpartName).toBe('Padaria Pão Quente Ltda');
    expect(r.counterpartDoc).toBe('12345678000190');
    expect(r.date).toBe('2026-09-25');
    expect(r.time).toBe('18:03');
    expect(r.pixId).toBe(E2E); // quebrado em duas linhas pelo OCR
    expect(r.bank).toBe('Nubank');
  });

  it('"Quem recebeu" com nome na mesma linha e sem ID E2E (usa a autenticação)', () => {
    const r = parsePixReceipt(rowsFromText(`
      PicPay
      Pix realizado
      Valor: R$ 150,00
      Quem recebeu: Maria Exemplo da Silva
      CPF: 123.***.***-45
      Data: 01/10/2026 12:00
      Autenticação: 9F8E7D6C5B4A39281716
    `));
    expect(r.amountCents).toBe(15000);
    expect(r.counterpartName).toBe('Maria Exemplo da Silva');
    expect(r.counterpartDoc).toBe('12345');
    expect(r.pixId).toBe('9F8E7D6C5B4A39281716');
    expect(r.bank).toBe('PicPay');
  });

  it('ignora a tarifa e pega o valor certo', () => {
    const r = parsePixReceipt(rowsFromText(`
      Pix
      Tarifa   R$ 0,00
      Valor da transferência   R$ 42,00
      Favorecido   CARLOS EXEMPLO
    `));
    expect(r.amountCents).toBe(4200);
    expect(r.counterpartName).toBe('CARLOS EXEMPLO');
  });

  it('Pix recebido: a outra parte é quem mandou', () => {
    const r = parsePixReceipt(rowsFromText(`
      Pix recebido
      Valor   R$ 300,00
      De      ANA EXEMPLO
      CPF     ***.111.222-**
      Para    JOAO TESTE
    `));
    expect(r.direction).toBe('received');
    expect(r.counterpartName).toBe('ANA EXEMPLO');
    expect(r.counterpartDoc).toBe('111222');
  });

  it('texto que não é comprovante devolve campos vazios', () => {
    const r = parsePixReceipt(rowsFromText('Foto de um gato\nsem nada'));
    expect(r).toMatchObject({ amountCents: null, counterpartName: null, pixId: null, looksLikePix: false });
  });
});

describe('regras por recebedor', () => {
  const rule = (over: Partial<PayeeRule>): PayeeRule => ({
    id: 'r', createdAt: '', updatedAt: '2026-09-01T00:00:00Z', deletedAt: null, matchName: 'jose ribeiro', matchDoc: null,
    description: 'Compra de pão', categoryId: 'padaria', accountId: null, ...over,
  });

  it('normaliza o nome', () => {
    expect(normalizeName('  José   Ribeiro-Silva ')).toBe('jose ribeiro silva');
  });

  it('acha pelo nome e prefere a regra com documento', () => {
    const rules = [rule({ id: 'nome' }), rule({ id: 'doc', matchDoc: '456789', description: 'Pão da esquina' })];
    expect(findPayeeRule(rules, 'JOSÉ RIBEIRO', '456789')?.id).toBe('doc');
    expect(findPayeeRule(rules, 'jose ribeiro', '999999')?.id).toBe('nome'); // outro José Ribeiro
    expect(findPayeeRule(rules, 'Maria', null)).toBeNull();
  });

  it('empate: vale a usada mais recentemente; excluída não vale', () => {
    const rules = [rule({ id: 'velha' }), rule({ id: 'nova', updatedAt: '2026-09-20T00:00:00Z' }), rule({ id: 'x', updatedAt: '2026-09-30T00:00:00Z', deletedAt: '2026-09-30T00:00:00Z' })];
    expect(findPayeeRule(rules, 'Jose Ribeiro', null)?.id).toBe('nova');
  });

  it('salvar de novo atualiza a mesma regra', () => {
    const k = { newId: () => 'novo', now: () => '2026-09-25T12:00:00Z' };
    const first = upsertPayeeRule([], { name: 'José Ribeiro', doc: '456789', description: ' Compra de pão ', categoryId: 'p', accountId: null }, k);
    expect(first).toMatchObject({ id: 'novo', matchName: 'jose ribeiro', matchDoc: '456789', description: 'Compra de pão' });
    const again = upsertPayeeRule([first], { name: 'JOSE RIBEIRO', doc: '456789', description: 'Pão e leite', categoryId: 'p', accountId: 'acc' }, { ...k, newId: () => 'outro' });
    expect(again.id).toBe('novo');
    expect(again.description).toBe('Pão e leite');
  });

  it('detecta comprovante já lançado', () => {
    const tx = [{ id: 'a', externalId: E2E, deletedAt: null }, { id: 'b', externalId: 'X', deletedAt: '2026-01-01' }];
    expect(findDuplicatePix(tx, E2E)?.id).toBe('a');
    expect(findDuplicatePix(tx, 'X')).toBeNull();
    expect(findDuplicatePix(tx, null)).toBeNull();
  });
});
