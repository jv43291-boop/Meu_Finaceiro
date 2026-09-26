/**
 * Relógio usado para marcar as alterações (updated_at) — decide quem vence no sync.
 *
 * Dois cuidados contra relógio de celular errado:
 * 1. Nunca volta para trás: cada marca é maior que qualquer updated_at que este
 *    aparelho já viu (dele ou baixado da nuvem). Quem corrige algo DEPOIS de ver
 *    a versão do outro sempre vence, mesmo com o relógio atrasado ou adiantado.
 * 2. Corrige pela hora do servidor: quando o sync mede a diferença entre o
 *    relógio do celular e o do Supabase, as marcas passam a usar a hora corrigida.
 *
 * Sem dependência de React/SQLite, para poder ser testado.
 */

/** Abaixo disso a diferença é ruído de rede/arredondamento: não corrige. */
export const OFFSET_APPLY_MS = 30_000;
/** A partir disso o app avisa que o relógio do celular está errado. */
export const OFFSET_WARN_MS = 2 * 60_000;

export interface Clock {
  /** marca ISO para uma alteração nova (sempre maior que a anterior) */
  now(): string;
  /** registra um updated_at visto (gravado aqui ou baixado), para nunca marcar antes dele */
  observe(iso: string | null | undefined): void;
  /** diferença medida: hora do servidor − hora do celular, em ms (null = desconhecida) */
  setOffset(ms: number | null): void;
  offset(): number | null;
}

export function createClock(wallNow: () => number = () => Date.now()): Clock {
  let floor = 0;
  let offsetMs: number | null = null;
  return {
    now() {
      const corrected = wallNow() + (offsetMs !== null && Math.abs(offsetMs) >= OFFSET_APPLY_MS ? offsetMs : 0);
      const t = Math.max(corrected, floor + 1);
      floor = t;
      return new Date(t).toISOString();
    },
    observe(iso) {
      if (!iso) return;
      const t = Date.parse(iso);
      if (Number.isFinite(t) && t > floor) floor = t;
    },
    setOffset(ms) {
      offsetMs = ms === null || !Number.isFinite(ms) ? null : Math.round(ms);
    },
    offset() {
      return offsetMs;
    },
  };
}

/** Relógio único do app. */
export const appClock = createClock();

/**
 * Diferença de relógio a partir do cabeçalho Date de uma resposta do servidor.
 * O cabeçalho tem resolução de 1 s; usa o meio do tempo de ida e volta.
 */
export function offsetFromDateHeader(dateHeader: string | null, sentAt: number, receivedAt: number): number | null {
  if (!dateHeader) return null;
  const server = Date.parse(dateHeader);
  if (!Number.isFinite(server)) return null;
  // o servidor arredonda para baixo o segundo: +500 ms é o centro esperado
  return server + 500 - (sentAt + receivedAt) / 2;
}
