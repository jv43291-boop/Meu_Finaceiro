/**
 * Arquivos da pessoa guardados pelo app no aparelho: a foto de fundo (pasta
 * "fundo") e o que passou pelo cache (imagens de comprovante, PDFs convertidos,
 * planilhas exportadas, fotos escolhidas). Apagados ao sair da conta.
 */
import { Directory, Paths } from 'expo-file-system';
import { Platform } from 'react-native';

function emptyDir(dir: Directory) {
  if (!dir.exists) return;
  for (const item of dir.list()) {
    try {
      item.delete();
    } catch {
      // arquivo em uso pelo sistema: fica para a próxima limpeza
    }
  }
}

export function clearPersonalFiles() {
  if (Platform.OS === 'web') return;
  try {
    emptyDir(new Directory(Paths.document, 'fundo'));
    emptyDir(Paths.cache);
  } catch {
    // limpeza é melhor-esforço: os dados já foram apagados do banco
  }
}
