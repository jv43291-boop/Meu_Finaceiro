/** Aviso simples de "os dados locais mudaram", para o sync agendar um envio. */
type Listener = () => void;
const listeners = new Set<Listener>();

export function emitLocalChange() {
  for (const l of listeners) l();
}

export function onLocalChange(l: Listener): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

/**
 * O aparelho foi zerado (saiu da conta ou entrou outra pessoa): quem guarda
 * preferência em memória (tema, lembretes, bloqueio) volta ao padrão.
 */
const resetListeners = new Set<Listener>();

export function emitDeviceReset() {
  for (const l of resetListeners) l();
}

export function onDeviceReset(l: Listener): () => void {
  resetListeners.add(l);
  return () => resetListeners.delete(l);
}
