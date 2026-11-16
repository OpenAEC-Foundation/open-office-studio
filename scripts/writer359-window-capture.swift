// Independent native window capture for isolated CI; no app/DOM injection.
import Foundation
import ScreenCaptureKit
import ImageIO
import UniformTypeIdentifiers

@main struct Capture {
    static func main() async throws {
        let pid = pid_t(CommandLine.arguments[1])!
        let content = try await SCShareableContent.excludingDesktopWindows(false, onScreenWindowsOnly: true)
        let candidates = content.windows.filter { $0.owningApplication?.processID == pid && $0.windowLayer == 0 && $0.frame.width >= 800 }
        guard candidates.count == 1 else { throw NSError(domain: "writer359", code: 1, userInfo: [NSLocalizedDescriptionKey: "Expected exactly one owned main window"]) }
        let window = candidates[0]
        let filter = SCContentFilter(desktopIndependentWindow: window)
        let config = SCStreamConfiguration()
        config.width = Int(window.frame.width)
        config.height = Int(window.frame.height)
        config.showsCursor = false
        let image = try await SCScreenshotManager.captureImage(contentFilter: filter, configuration: config)
        let url = URL(fileURLWithPath: CommandLine.arguments[2])
        guard let destination = CGImageDestinationCreateWithURL(url as CFURL, UTType.png.identifier as CFString, 1, nil) else { throw NSError(domain: "writer359", code: 2) }
        CGImageDestinationAddImage(destination, image, nil)
        guard CGImageDestinationFinalize(destination) else { throw NSError(domain: "writer359", code: 3) }
        let report: [String: Any] = ["pid": pid, "windowID": window.windowID, "windowTitle": window.title ?? "", "width": image.width, "height": image.height, "method": "ScreenCaptureKit desktopIndependentWindow SCScreenshotManager"]
        print(String(data: try JSONSerialization.data(withJSONObject: report, options: [.sortedKeys]), encoding: .utf8)!)
    }
}
