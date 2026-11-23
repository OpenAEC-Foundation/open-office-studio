// Read original owned-window pixels only. No app, input, image edits or privacy changes.
// Policy follows the separately owned mac-native-body-ocr.swift diagnostic.
import Foundation
import Vision
import ImageIO
import CryptoKit

guard CommandLine.arguments.count == 3 else { fatalError("Original PNG and new output required") }
let input=URL(fileURLWithPath:CommandLine.arguments[1])
let output=URL(fileURLWithPath:CommandLine.arguments[2])
let data=try Data(contentsOf:input)
guard let source=CGImageSourceCreateWithData(data as CFData,nil),
      let properties=CGImageSourceCopyPropertiesAtIndex(source,0,nil) as? [CFString:Any],
      let width=properties[kCGImagePropertyPixelWidth] as? Int,
      let height=properties[kCGImagePropertyPixelHeight] as? Int else {fatalError("Original PNG dimensions unavailable")}
let request=VNRecognizeTextRequest()
request.recognitionLevel = .accurate
request.usesLanguageCorrection=false
request.recognitionLanguages=["en-US"]
try VNImageRequestHandler(url:input,options:[:]).perform([request])
var words:[[String:Any]]=[]
let pattern=try NSRegularExpression(pattern:"\\S+")
for observation in request.results ?? [] {
    guard let candidate=observation.topCandidates(1).first else {continue}
    let text=candidate.string
    for match in pattern.matches(in:text,range:NSRange(text.startIndex...,in:text)) {
        guard let range=Range(match.range,in:text),let box=try? candidate.boundingBox(for:range) else {continue}
        let r=box.boundingBox
        words.append(["text":String(text[range]),"confidence":candidate.confidence,
            "normalizedBottomLeft":["x":r.minX,"y":r.minY,"width":r.width,"height":r.height]])
    }
}
let report:[String:Any]=["imageSha256":SHA256.hash(data:data).map {String(format:"%02x",$0)}.joined(),
    "width":width,"height":height,"wordObservations":words,"imageModified":false,"editorInputSent":false]
try JSONSerialization.data(withJSONObject:report,options:[.prettyPrinted,.sortedKeys]).write(to:output,options:.withoutOverwriting)
