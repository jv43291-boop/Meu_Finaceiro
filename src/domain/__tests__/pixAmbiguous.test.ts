import { describe, expect, it } from 'vitest';

import { parsePixReceipt, rowsFromText } from '../pixReceipt';

// Comprovantes FICTÍCIOS com as armadilhas comuns de OCR e de layout.
const read = (t: string) => parsePixReceipt(rowsFromText(t));

describe('casos ambíguos do comprovante', () => {
  it('valor com milhar e saldo na mesma tela: pega o valor, não o saldo', () => {
    const r = read(`
      Pix enviado
      Saldo disponível   R$ 12.345,67
      Valor   R$ 1.250,00
      Para   ANA EXEMPLO
    `);
    expect(r.amountCents).toBe(125000);
  });

  it('"Valor pago" e "Valor da tarifa": pega o pago', () => {
    const r = read(`
      Comprovante Pix
      Valor da tarifa   R$ 0,00
      Valor pago   R$ 89,90
      Favorecido   LOJA EXEMPLO LTDA
      CNPJ   12.345.678/0001-90
    `);
    expect(r.amountCents).toBe(8990);
    expect(r.counterpartName).toBe('LOJA EXEMPLO LTDA');
    expect(r.counterpartDoc).toBe('12345678000190');
  });

  it('duas datas (pagamento e emissão do comprovante): usa a do rótulo "Data"', () => {
    const r = read(`
      Comprovante emitido em 30/09/2026 10:00
      Pix enviado
      Valor   R$ 10,00
      Data do pagamento   28/09/2026 21:15
      Para   JOSE EXEMPLO
    `);
    expect(r.date).toBe('2026-09-28');
    expect(r.time).toBe('21:15');
  });

  it('nome e CPF na mesma linha do "Para"', () => {
    const r = read(`
      Pix
      Valor R$ 35,00
      Para JOSE EXEMPLO DA SILVA   CPF ***.123.456-**
    `);
    expect(r.counterpartName).toBe('JOSE EXEMPLO DA SILVA');
    expect(r.counterpartDoc).toBe('123456');
  });

  it('OCR que troca $ por S e junta o R$ ao número', () => {
    expect(read('Pix\nValor RS8,50\nPara ANA EXEMPLO').amountCents).toBe(850);
    expect(read('Pix\nValor R$8,50\nPara ANA EXEMPLO').amountCents).toBe(850);
  });

  it('ID do Pix com espaço no meio (quebra do OCR)', () => {
    const r = read('Pix\nValor R$ 5,00\nPara ANA EXEMPLO\nID da transação E1234567820260925 1432Ab12Cd34Ef5');
    expect(r.pixId).toBe('E12345678202609251432Ab12Cd34Ef5');
  });

  it('sem nome do recebedor: não inventa (deixa em branco para a pessoa preencher)', () => {
    const r = read('Pix enviado\nValor R$ 20,00\nData 26/09/2026');
    expect(r.counterpartName).toBeNull();
    expect(r.amountCents).toBe(2000);
  });

  it('rótulo "Instituição" logo abaixo do nome não vira o nome', () => {
    const r = read(`
      Pix
      Valor   R$ 15,00
      Destino
      Instituição   BANCO EXEMPLO
      Nome   MARIA EXEMPLO
    `);
    expect(r.counterpartName).toBe('MARIA EXEMPLO');
  });
});
