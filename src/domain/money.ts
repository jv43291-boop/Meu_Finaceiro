/**
 * Valores monetários são sempre inteiros em centavos.
 * Nunca somar reais em ponto flutuante.
 */

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

export function formatBRL(cents: number): string {
  return brl.format(cents / 100);
}

/** Formata sem o símbolo, útil para preencher inputs: 162150 -> "1.621,50" */
export function formatPlain(cents: number): string {
  const negative = cents < 0;
  const abs = Math.abs(Math.round(cents));
  const reais = Math.floor(abs / 100);
  const cent = abs % 100;
  const withDots = String(reais).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${negative ? '-' : ''}${withDots},${String(cent).padStart(2, '0')}`;
}

/**
 * Converte o que a pessoa digitou em centavos.
 * Aceita "1621", "1.621,50", "1621,5", "1621.50", "R$ 1.621,50".
 * Retorna null se não for um número válido.
 */
export function parseMoney(input: string): number | null {
  let s = input.replace(/R\$|\s/g, '').trim();
  if (!s) return null;
  const negative = s.startsWith('-');
  if (negative) s = s.slice(1);
  if (!/^[\d.,]+$/.test(s)) return null;

  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  let intPart: string;
  let decPart = '';

  if (lastComma >= 0) {
    // vírgula é o separador decimal (padrão BR); pontos são milhar
    intPart = s.slice(0, lastComma).replace(/\./g, '');
    decPart = s.slice(lastComma + 1);
    if (decPart.includes('.')) return null;
  } else if (lastDot >= 0) {
    const after = s.slice(lastDot + 1);
    const dots = (s.match(/\./g) ?? []).length;
    if (dots === 1 && after.length > 0 && after.length <= 2) {
      // "1621.50" -> ponto decimal
      intPart = s.slice(0, lastDot);
      decPart = after;
    } else {
      // "1.621" ou "1.000.000" -> pontos de milhar
      intPart = s.replace(/\./g, '');
    }
  } else {
    intPart = s;
  }

  if (!/^\d*$/.test(intPart) || !/^\d*$/.test(decPart)) return null;
  if (decPart.length > 2) return null;
  if (!intPart && !decPart) return null;

  const cents = Number(intPart || '0') * 100 + Number(decPart.padEnd(2, '0') || '0');
  if (!Number.isFinite(cents)) return null;
  return negative ? -cents : cents;
}

/** Converte valor antigo em reais (float) para centavos, arredondando. */
export function reaisToCents(value: number): number {
  return Math.round(value * 100);
}
