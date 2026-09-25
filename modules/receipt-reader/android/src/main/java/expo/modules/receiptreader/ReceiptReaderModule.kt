package expo.modules.receiptreader

import android.graphics.Bitmap
import android.graphics.Color
import android.graphics.pdf.PdfRenderer
import android.net.Uri
import android.os.ParcelFileDescriptor
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.io.FileOutputStream

/**
 * Leitor de comprovantes, tudo no aparelho (nada sai do celular):
 * - renderPdfPageAsync: página de PDF -> PNG (PdfRenderer do Android);
 * - recognizeTextAsync: texto da imagem, linha a linha, com a posição de cada
 *   linha (ML Kit), para remontar "rótulo ... valor" em comprovantes de duas colunas.
 */
class ReceiptReaderModule : Module() {
  private fun toUri(value: String): Uri {
    val parsed = Uri.parse(value)
    return if (parsed.scheme.isNullOrEmpty()) Uri.fromFile(File(value)) else parsed
  }

  override fun definition() = ModuleDefinition {
    Name("ReceiptReader")

    AsyncFunction("renderPdfPageAsync") { uri: String, pageIndex: Int, width: Int ->
      val context = appContext.reactContext
        ?: throw CodedException("ERR_RECEIPT_CONTEXT", "Aplicativo ainda não está pronto", null)
      val parsed = toUri(uri)
      val descriptor: ParcelFileDescriptor = if (parsed.scheme == "content") {
        context.contentResolver.openFileDescriptor(parsed, "r")
          ?: throw CodedException("ERR_PDF_OPEN", "Não foi possível abrir o PDF", null)
      } else {
        ParcelFileDescriptor.open(File(parsed.path ?: uri), ParcelFileDescriptor.MODE_READ_ONLY)
      }

      descriptor.use { fd ->
        val renderer = PdfRenderer(fd)
        try {
          if (renderer.pageCount == 0) {
            throw CodedException("ERR_PDF_EMPTY", "O PDF não tem páginas", null)
          }
          val index = pageIndex.coerceIn(0, renderer.pageCount - 1)
          val page = renderer.openPage(index)
          try {
            val w = width.coerceIn(400, 3000)
            val h = (w.toLong() * page.height / page.width).toInt().coerceAtLeast(1)
            val bitmap = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
            bitmap.eraseColor(Color.WHITE)
            page.render(bitmap, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY)
            val out = File(context.cacheDir, "comprovante-${System.currentTimeMillis()}-$index.png")
            FileOutputStream(out).use { stream -> bitmap.compress(Bitmap.CompressFormat.PNG, 100, stream) }
            bitmap.recycle()
            mapOf(
              "uri" to Uri.fromFile(out).toString(),
              "pageCount" to renderer.pageCount,
              "width" to w,
              "height" to h
            )
          } finally {
            page.close()
          }
        } finally {
          renderer.close()
        }
      }
    }

    AsyncFunction("recognizeTextAsync") { uri: String, promise: Promise ->
      val context = appContext.reactContext
      if (context == null) {
        promise.reject(CodedException("ERR_RECEIPT_CONTEXT", "Aplicativo ainda não está pronto", null))
      } else {
        try {
          val image = InputImage.fromFilePath(context, toUri(uri))
          val recognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)
          recognizer.process(image)
            .addOnSuccessListener { result ->
              val lines = ArrayList<Map<String, Any>>()
              for (block in result.textBlocks) {
                for (line in block.lines) {
                  val box = line.boundingBox
                  lines.add(
                    mapOf(
                      "text" to line.text,
                      "x" to (box?.left ?: 0),
                      "y" to (box?.top ?: 0),
                      "width" to (box?.width() ?: 0),
                      "height" to (box?.height() ?: 0)
                    )
                  )
                }
              }
              promise.resolve(mapOf("width" to image.width, "height" to image.height, "lines" to lines))
              recognizer.close()
            }
            .addOnFailureListener { error ->
              promise.reject(CodedException("ERR_OCR", error.message ?: "Não foi possível ler o texto", error))
              recognizer.close()
            }
        } catch (error: Exception) {
          promise.reject(CodedException("ERR_OCR", error.message ?: "Não foi possível abrir a imagem", error))
        }
      }
    }
  }
}
