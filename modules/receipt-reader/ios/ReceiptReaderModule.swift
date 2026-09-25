import ExpoModulesCore
import PDFKit
import UIKit
import Vision

/// Leitor de comprovantes no aparelho: PDF -> PNG (PDFKit) e texto com posição (Vision).
public class ReceiptReaderModule: Module {
  public func definition() -> ModuleDefinition {
    Name("ReceiptReader")

    AsyncFunction("renderPdfPageAsync") { (uri: String, pageIndex: Int, width: Int) throws -> [String: Any] in
      guard let url = URL(string: uri), let doc = PDFDocument(url: url), doc.pageCount > 0 else {
        throw ReceiptException("Não foi possível abrir o PDF")
      }
      let index = max(0, min(pageIndex, doc.pageCount - 1))
      guard let page = doc.page(at: index) else { throw ReceiptException("Não foi possível abrir o PDF") }
      let bounds = page.bounds(for: .mediaBox)
      let w = CGFloat(max(400, min(width, 3000)))
      let scale = w / bounds.width
      let size = CGSize(width: w, height: max(1, bounds.height * scale))
      let format = UIGraphicsImageRendererFormat()
      format.scale = 1
      let image = UIGraphicsImageRenderer(size: size, format: format).image { ctx in
        UIColor.white.setFill()
        ctx.fill(CGRect(origin: .zero, size: size))
        ctx.cgContext.translateBy(x: 0, y: size.height)
        ctx.cgContext.scaleBy(x: scale, y: -scale)
        page.draw(with: .mediaBox, to: ctx.cgContext)
      }
      guard let data = image.pngData() else { throw ReceiptException("Não foi possível converter o PDF") }
      let out = FileManager.default.temporaryDirectory
        .appendingPathComponent("comprovante-\(Int(Date().timeIntervalSince1970 * 1000))-\(index).png")
      try data.write(to: out)
      return ["uri": out.absoluteString, "pageCount": doc.pageCount, "width": Int(size.width), "height": Int(size.height)]
    }

    AsyncFunction("recognizeTextAsync") { (uri: String, promise: Promise) in
      let url = URL(string: uri) ?? URL(fileURLWithPath: uri)
      guard let data = try? Data(contentsOf: url), let image = UIImage(data: data), let cg = image.cgImage else {
        promise.reject("ERR_OCR", "Não foi possível abrir a imagem")
        return
      }
      let width = CGFloat(cg.width)
      let height = CGFloat(cg.height)
      let request = VNRecognizeTextRequest { req, error in
        if let error = error {
          promise.reject("ERR_OCR", error.localizedDescription)
          return
        }
        let observations = (req.results as? [VNRecognizedTextObservation]) ?? []
        let lines: [[String: Any]] = observations.compactMap { obs in
          guard let best = obs.topCandidates(1).first else { return nil }
          let b = obs.boundingBox
          return [
            "text": best.string,
            "x": Int(b.minX * width),
            "y": Int((1 - b.maxY) * height),
            "width": Int(b.width * width),
            "height": Int(b.height * height),
          ]
        }
        promise.resolve(["width": Int(width), "height": Int(height), "lines": lines])
      }
      request.recognitionLevel = .accurate
      request.recognitionLanguages = ["pt-BR"]
      request.usesLanguageCorrection = false
      DispatchQueue.global(qos: .userInitiated).async {
        do {
          try VNImageRequestHandler(cgImage: cg, options: [:]).perform([request])
        } catch {
          promise.reject("ERR_OCR", error.localizedDescription)
        }
      }
    }
  }
}

internal final class ReceiptException: Exception {
  private let text: String
  init(_ text: String) {
    self.text = text
    super.init()
  }
  override var reason: String { text }
}
