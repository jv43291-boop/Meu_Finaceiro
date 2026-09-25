import { NativeModule, requireOptionalNativeModule } from 'expo';

export interface RenderedPage {
  /** file:// da imagem PNG gerada */
  uri: string;
  pageCount: number;
  width: number;
  height: number;
}

export interface OcrLine {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface OcrResult {
  width: number;
  height: number;
  lines: OcrLine[];
}

declare class ReceiptReaderModule extends NativeModule<{}> {
  renderPdfPageAsync(uri: string, pageIndex: number, width: number): Promise<RenderedPage>;
  recognizeTextAsync(uri: string): Promise<OcrResult>;
}

/** null no Expo Go e na web: o módulo só existe no APK gerado pelo EAS. */
export default requireOptionalNativeModule<ReceiptReaderModule>('ReceiptReader');
