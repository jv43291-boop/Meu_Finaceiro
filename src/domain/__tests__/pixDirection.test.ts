/**
 * Gasto ou receita: o comprovante precisa dizer de que lado você está.
 * Todos os nomes, documentos e IDs são FICTÍCIOS.
 */
import { describe, expect, it } from 'vitest';

import { EMPTY_IDENTITY, isMe, learnIdentity, parseIdentity, sameName } from '../pixIdentity';
import { keywordDirection, parsePixReceipt, rowsFromText } from '../pixReceipt';
import itau from './fixtures/pix/itau.txt?raw';
import picpay from './fixtures/pix/picpay.txt?raw';
import recebido from './fixtures/pix/recebido.txt?raw';

const CARLOS = { names: ['Carlos Teste Exemplo'], docs: ['111222'] };
const read = (text: string, me = EMPTY_IDENTITY) => parsePixReceipt(rowsFromText(text), me);

describe('nomes', () => {
  it('tolera nome do meio abreviado ou omitido', () => {
    expect(sameName('Carlos T Exemplo', 'CARLOS TESTE EXEMPLO')).toBe(true);
    expect(sameName('Carlos Exemplo', 'Carlos Teste Exemplo')).toBe(true);
    expect(sameName('Ana Paula dos Santos', 'ANA PAULA SANTOS')).toBe(true);
  });
  it('não confunde pessoas diferentes', () => {
    expect(sameName('Carla Teste Exemplo', 'Carlos Teste Exemplo')).toBe(false);
    expect(sameName('Carlos Teste Silva', 'Carlos Teste Exemplo')).toBe(false);
    expect(sameName('Carlos', 'Carlos Teste Exemplo')).toBe(false);
    expect(sameName('Carlos Maria Exemplo', 'Carlos Teste Exemplo')).toBe(false);
  });
  it('reconhece pelo documento mesmo com nome diferente', () => {
    expect(isMe(CARLOS, { name: 'C T E', doc: '111222' })).toBe(true);
    expect(isMe(CARLOS, { name: null, doc: '999888' })).toBe(false);
  });
});

describe('o que o comprovante diz', () => {
  it('frases de enviado e de recebido; vale a primeira', () => {
    expect(keywordDirection('voce recebeu um pix')).toBe('received');
    expect(keywordDirection('comprovante de recebimento')).toBe('received');
    expect(keywordDirection('pix enviado')).toBe('sent');
    expect(keywordDirection('comprovante de pagamento')).toBe('sent');
    expect(keywordDirection('pix recebido\nvalor recebido\nlink: comprovante de pagamento')).toBe('received');
  });
  it('"Quem recebeu" e "Recebedor" são rótulos, não dizem o sentido', () => {
    expect(keywordDirection('comprovante de pix\nquem recebeu\nrecebedor\nrealizado em 12/08/2026')).toBeNull();
    expect(read(picpay).directionSource).toBe('default');
  });
});

describe('gasto ou receita', () => {
  it('sem frase e sem saber quem é você: fica em aberto (a tela pergunta)', () => {
    const r = read(itau);
    expect(r).toMatchObject({ direction: 'sent', directionSource: 'default' });
  });

  it('você é quem pagou: gasto, a outra parte é quem recebeu', () => {
    const r = read(itau, CARLOS);
    expect(r).toMatchObject({ direction: 'sent', directionSource: 'identity', counterpartName: 'Maria Ficticia Souza', counterpartDoc: '333444' });
  });

  it('você é quem recebeu: receita, a outra parte é quem pagou', () => {
    const maria = { names: ['Maria F Souza'], docs: [] };
    const r = read(itau, maria);
    expect(r).toMatchObject({ direction: 'received', directionSource: 'identity', counterpartName: 'Carlos Teste Exemplo', counterpartDoc: '111222', ownTransfer: false });
  });

  it('"Você recebeu um Pix": receita mesmo sem saber quem é você', () => {
    const r = read(recebido);
    expect(r).toMatchObject({
      direction: 'received', directionSource: 'keyword', amountCents: 150000,
      counterpartName: 'Empresa Ficticia Servicos Ltda', counterpartDoc: '00000111000122', date: '2026-08-22', time: '09:10',
    });
  });

  it('você do lado de quem recebeu confirma a receita', () => {
    expect(read(recebido, CARLOS)).toMatchObject({ direction: 'received', directionSource: 'identity', ownTransfer: false });
  });

  it('o seu nome vale mais que uma frase enganosa', () => {
    const text = recebido.replace('Você recebeu um Pix', 'Pix enviado');
    expect(read(text, CARLOS)).toMatchObject({ direction: 'received', directionSource: 'identity' });
  });

  it('você dos dois lados (CPF mascarado diferente): transferência entre suas contas', () => {
    const text = `Pix
      R$ 50,00
      De   CARLOS T EXEMPLO
      CPF   123.***.***-45
      Para   Carlos Teste Exemplo
      CPF   ***.111.222-**`;
    const r = read(text, CARLOS);
    expect(r.ownTransfer).toBe(true);
    expect(r.directionSource).not.toBe('identity');
  });
});

describe('aprender quem é você', () => {
  it('guarda nome e documento, sem repetir, o mais recente primeiro', () => {
    let me = learnIdentity(EMPTY_IDENTITY, { name: 'Carlos Teste Exemplo', doc: '111222' });
    me = learnIdentity(me, { name: 'CARLOS TESTE EXEMPLO', doc: '12345' });
    expect(me).toEqual({ names: ['CARLOS TESTE EXEMPLO'], docs: ['12345', '111222'] });
  });
  it('ignora lado vazio e documento inválido; limita a 8', () => {
    expect(learnIdentity(EMPTY_IDENTITY, { name: null, doc: 'abc' })).toEqual(EMPTY_IDENTITY);
    let me = EMPTY_IDENTITY;
    for (let i = 0; i < 12; i++) me = learnIdentity(me, { name: `Pessoa ${i} Exemplo`, doc: String(10 + i) });
    expect(me.names).toHaveLength(8);
    expect(me.docs[0]).toBe('21');
  });
  it('lê o que foi guardado sem quebrar com lixo', () => {
    expect(parseIdentity(null)).toEqual(EMPTY_IDENTITY);
    expect(parseIdentity('{oops')).toEqual(EMPTY_IDENTITY);
    expect(parseIdentity('{"names":["A B"],"docs":[1,"22"]}')).toEqual({ names: ['A B'], docs: ['22'] });
  });
});
