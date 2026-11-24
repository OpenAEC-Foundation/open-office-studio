import ApplicationServices
import CoreGraphics
import Foundation

// Queries only: no requestAccess, prompt, event, capture, observer or app action.
let value: [String: Any] = [
    "accessibilityTrustedForThisHelper": AXIsProcessTrusted(),
    "postEventPreflightForThisHelper": CGPreflightPostEventAccess(),
    "screenCapturePreflightForThisHelper": CGPreflightScreenCaptureAccess(),
    "processId": ProcessInfo.processInfo.processIdentifier,
    "scope": "nonprompting helper capability only; no target receiver/inspection/attach test"
]
let data = try JSONSerialization.data(withJSONObject: value, options: [.sortedKeys])
FileHandle.standardOutput.write(data)
FileHandle.standardOutput.write(Data([10]))
