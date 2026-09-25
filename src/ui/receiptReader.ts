/**
 * Caminho do arquivo até os campos: escolhe (galeria / arquivos / compartilhado),
 * transforma PDF em imagem, lê o texto no aparelho e interpreta o comprovante.
 * Nada é enviado para servidor.
 */
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';

import { ReceiptReader } from '../../modules/receipt-reader';
import { parsePixReceipt, toRows, type PixReceipt } from '@/domain/pixReceipt';

export interface ReceiptFile {
  uri: string;
  mimeType: string | null;
  name?: string | null;
}

export interface ReadResult {
  /** imagem que foi lida (a própria foto, ou a 1ª página do PDF) */
  imageUri: string;
  receipt: PixReceipt;
  /** texto lido, para a pessoa conferir se algo saiu estranho */
  text: string;
}

/** O leitor só existe no app instalado (APK); no Expo Go e na web não. */
export const readerAvailable = ReceiptReader !== null;

export async function pickFromGallery(): Promise<ReceiptFile | null> {
  const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: false, quality: 1 });
  if (res.canceled || !res.assets?.[0]) return null;
  const a = res.assets[0];
  return { uri: a.uri, mimeType: a.mimeType ?? 'image/jpeg', name: a.fileName };
}

export async function pickFromFiles(): Promise<ReceiptFile | null> {
  const res = await DocumentPicker.getDocumentAsync({ type: ['application/pdf', 'image/*'], copyToCacheDirectory: true });
  if (res.canceled || !res.assets?.[0]) return null;
  const a = res.assets[0];
  return { uri: a.uri, mimeType: a.mimeType ?? null, name: a.name };
}

export function isPdf(file: ReceiptFile): boolean {
  return file.mimeType === 'application/pdf' || /\.pdf$/i.test(file.name ?? file.uri);
}

export async function readReceipt(file: ReceiptFile): Promise<ReadResult> {
  if (!ReceiptReader) {
    throw new Error('A leitura de comprovante funciona só no app instalado (APK). No Expo Go ela não está disponível.');
  }
  let imageUri = file.uri;
  if (isPdf(file)) {
    const page = await ReceiptReader.renderPdfPageAsync(file.uri, 0, 1600);
    imageUri = page.uri;
  }
  const ocr = await ReceiptReader.recognizeTextAsync(imageUri);
  if (!ocr.lines.length) throw new Error('Não encontrei texto nesse arquivo. Tente o print ou o PDF do comprovante.');
  const rows = toRows(ocr.lines);
  return { imageUri, receipt: parsePixReceipt(rows), text: rows.map((r) => r.join('   ')).join('\n') };
}
