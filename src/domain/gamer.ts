/**
 * Modo gamer: como os números viram barras de jogo. Só apresentação —
 * os valores continuam vindo das regras de orçamento e metas.
 *
 * - Orçamento = HP: começa cheio e esvazia conforme o gasto; estourou = 0.
 * - Meta = XP: enche conforme o que foi guardado.
 */
export const SEGMENTS = 10;

function clamp01(x: number): number {
  return Number.isFinite(x) ? Math.min(1, Math.max(0, x)) : 0;
}

/** blocos de HP cheios; qualquer sobra, por menor que seja, mantém 1 bloco aceso */
export function hpSegments(spentRatio: number, n = SEGMENTS): number {
  const left = 1 - clamp01(spentRatio);
  if (spentRatio >= 1 || left <= 0) return 0;
  return Math.max(1, Math.ceil(left * n - 1e-9));
}

/** blocos de XP cheios; só fica tudo cheio quando a meta foi mesmo concluída */
export function xpSegments(ratio: number, n = SEGMENTS): number {
  const r = clamp01(ratio);
  if (r >= 1) return n;
  return Math.min(n - 1, Math.floor(r * n + 1e-9));
}
