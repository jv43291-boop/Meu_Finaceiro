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
