import { Directory, File, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { Platform } from 'react-native';

/** Largura máxima guardada: suficiente para qualquer celular e leve na memória. */
const MAX_WIDTH = 1440;

/**
 * Abre a galeria, reduz a foto e guarda uma cópia dentro do app
 * (continua funcionando mesmo se a foto for apagada da galeria).
 * Devolve o endereço da cópia, ou null se a pessoa cancelou.
 */
export async function pickBackground(previous: string | null): Promise<string | null> {
  const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: false, quality: 1 });
  if (res.canceled || !res.assets?.[0]) return null;
  const asset = res.assets[0];

  if (Platform.OS === 'web') return asset.uri;

  const ctx = ImageManipulator.manipulate(asset.uri);
  if (asset.width && asset.width > MAX_WIDTH) ctx.resize({ width: MAX_WIDTH });
  const rendered = await ctx.renderAsync();
  const saved = await rendered.saveAsync({ compress: 0.82, format: SaveFormat.JPEG });

  const dir = new Directory(Paths.document, 'fundo');
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  // nome novo a cada troca, para o cache de imagem não mostrar a foto anterior
  const target = new File(dir, `fundo-${Date.now()}.jpg`);
  await new File(saved.uri).copy(target);
  removeBackground(previous);
  return target.uri;
}

/** Apaga a cópia guardada (não mexe na galeria). */
export function removeBackground(uri: string | null) {
  if (!uri || Platform.OS === 'web') return;
  try {
    const f = new File(uri);
    if (f.exists) f.delete();
  } catch {
    // arquivo já não existe: nada a fazer
  }
}

export function backgroundExists(uri: string | null): boolean {
  if (!uri) return false;
  if (Platform.OS === 'web') return true;
  try {
    return new File(uri).exists;
  } catch {
    return false;
  }
}
