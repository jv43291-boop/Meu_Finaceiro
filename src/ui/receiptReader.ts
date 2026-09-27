/**
 * Caminho do arquivo até os campos: escolhe (galeria / arquivos / compartilhado),
 * transforma PDF em imagem, lê o texto no aparelho e interpreta o comprovante.
 * Nada é enviado para servidor.
 */
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';

import { ReceiptReader } from '../../modules/receipt-reader';
import type { OwnIdentity } from '@/domain/pixIdentity';
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

/** `me`: quem é você nos comprovantes, para saber se foi gasto ou receita */
export async function readReceipt(file: ReceiptFile, me?: OwnIdentity): Promise<ReadResult> {
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
  return { imageUri, receipt: parsePixReceipt(rows, me), text: rows.map((r) => r.join('   ')).join('\n') };
}

export interface StatementRead {
  rows: ReturnType<typeof toRows>;
  pages: number;
  /** o PDF tinha mais páginas do que o limite lido */
  truncated: boolean;
  text: string;
}

/** Extrato: lê TODAS as páginas do PDF (até 30), uma depois da outra. */
export async function readStatementFile(file: ReceiptFile, onPage?: (done: number, total: number) => void): Promise<StatementRead> {
  if (!ReceiptReader) {
    throw new Error('A leitura de extrato funciona só no app instalado (APK). No Expo Go ela não está disponível.');
  }
  const MAX = 30;
  const rows: ReturnType<typeof toRows> = [];
  let pages = 1;
  let total = 1;
  if (isPdf(file)) {
    const first = await ReceiptReader.renderPdfPageAsync(file.uri, 0, 2000);
    total = first.pageCount;
    pages = Math.min(total, MAX);
    for (let i = 0; i < pages; i++) {
      onPage?.(i, pages);
      const page = i === 0 ? first : await ReceiptReader.renderPdfPageAsync(file.uri, i, 2000);
      const ocr = await ReceiptReader.recognizeTextAsync(page.uri);
      rows.push(...toRows(ocr.lines));
    }
  } else {
    const ocr = await ReceiptReader.recognizeTextAsync(file.uri);
    rows.push(...toRows(ocr.lines));
  }
  if (!rows.length) throw new Error('Não encontrei texto nesse arquivo. Confira se é o PDF do extrato.');
  return { rows, pages, truncated: total > pages, text: rows.map((r) => r.join('   ')).join('\n') };
}
