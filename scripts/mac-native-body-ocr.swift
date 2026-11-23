// Analyze an original owned-window PNG. No app launch, input or permissions.
import Foundation
import Vision
import ImageIO
import CryptoKit

let input = URL(fileURLWithPath: CommandLine.arguments[1])
let output = URL(fileURLWithPath: CommandLine.arguments[2])
let data = try Data(contentsOf: input)
guard let source = CGImageSourceCreateWithData(data as CFData, nil),
      let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any],
      let width = properties[kCGImagePropertyPixelWidth] as? Int,
      let height = properties[kCGImagePropertyPixelHeight] as? Int else {
    fatalError("Original PNG dimensions unavailable")
}
let request = VNRecognizeTextRequest()
request.recognitionLevel = .accurate
request.usesLanguageCorrection = false
request.recognitionLanguages = ["en-US"]
try VNImageRequestHandler(url: input, options: [:]).perform([request])
let observations: [[String: Any]] = (request.results ?? []).compactMap { observation in
    guard let candidate = observation.topCandidates(1).first else { return nil }
    let rect = observation.boundingBox
    return ["text": candidate.string, "confidence": candidate.confidence,
            "normalizedBottomLeft": ["x": rect.minX, "y": rect.minY,
                                     "width": rect.width, "height": rect.height]]
}
let report: [String: Any] = ["imageSha256": SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined(),
                           "width": width, "height": height, "observations": observations,
                           "imageModified": false, "editorInputSent": false]
try JSONSerialization.data(withJSONObject: report, options: [.prettyPrinted, .sortedKeys]).write(to: output, options: .withoutOverwriting)
