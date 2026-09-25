/**
 * "Compartilhar → Live" abre o app por um link com o host "expo-sharing":
 * manda direto para a tela do comprovante.
 */
export function redirectSystemPath({ path }: { path: string; initial: boolean }) {
  try {
    if (new URL(path).hostname === 'expo-sharing') return '/comprovante';
    return path;
  } catch {
    return path;
  }
}
