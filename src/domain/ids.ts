/**
 * Id determinístico em formato UUID a partir de um texto.
 * Usado quando dois aparelhos precisam gerar o MESMO id sem se falar:
 * a ocorrência "recorrência X no mês M" e as categorias padrão.
 * Não é criptográfico; só precisa ser estável e bem espalhado.
 */
function fnv1a(str: string, seed: number): number {
  let h = seed >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

export function stableId(key: string): string {
  const parts = [0x811c9dc5, 0x01234567, 0x89abcdef, 0x5bd1e995].map((s) => fnv1a(key, s).toString(16).padStart(8, '0'));
  const hex = parts.join('');
  // marca versão 5 e variante RFC 4122 para ser um UUID válido
  const v = hex.slice(0, 12) + '5' + hex.slice(13, 16) + ((parseInt(hex[16], 16) & 0x3) | 0x8).toString(16) + hex.slice(17, 32);
  return `${v.slice(0, 8)}-${v.slice(8, 12)}-${v.slice(12, 16)}-${v.slice(16, 20)}-${v.slice(20, 32)}`;
}

export function occurrenceId(recurrenceId: string, month: string): string {
  return stableId(`occ:${recurrenceId}:${month}`);
}
