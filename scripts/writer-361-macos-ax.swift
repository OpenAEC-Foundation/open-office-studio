// Private helper for proef-writer-361-macos.py. Native AX/CGEvent only.
// No TCC grants, JavaScript injection, app launch or process termination.
import ApplicationServices
import AppKit
import Foundation

let pid = pid_t(CommandLine.arguments[1])!
let action = CommandLine.arguments[2]
let target = CommandLine.arguments.count > 3 ? CommandLine.arguments[3] : ""
let app = AXUIElementCreateApplication(pid)
let deadline = Date().addingTimeInterval(12)
AXUIElementSetMessagingTimeout(app, 0.4)
var report: [String: Any] = ["pid": pid, "action": action, "trusted": AXIsProcessTrusted()]
var errors: [String: Int] = [:]
func attr(_ element: AXUIElement, _ key: String) -> CFTypeRef? {
    if Date() >= deadline { return nil }
    var value: CFTypeRef?
    let result = AXUIElementCopyAttributeValue(element, key as CFString, &value)
    if result != .success { errors[String(result.rawValue), default: 0] += 1 }
    return value
}
func text(_ element: AXUIElement, _ key: String) -> String {
    String((attr(element, key) as? String ?? "").prefix(240))
}
func summary(_ element: AXUIElement) -> [String: Any] {
    ["role": text(element, kAXRoleAttribute), "title": text(element, kAXTitleAttribute),
     "description": text(element, kAXDescriptionAttribute)]
}
func pointAndSize(_ element: AXUIElement) -> (CGPoint, CGSize)? {
    guard let p = attr(element, kAXPositionAttribute), let s = attr(element, kAXSizeAttribute),
          CFGetTypeID(p) == AXValueGetTypeID(), CFGetTypeID(s) == AXValueGetTypeID() else { return nil }
    var point = CGPoint.zero; var size = CGSize.zero
    guard AXValueGetValue(p as! AXValue, .cgPoint, &point), AXValueGetValue(s as! AXValue, .cgSize, &size),
          size.width > 1, size.height > 1 else { return nil }
    return (point, size)
}
func children(_ element: AXUIElement) -> [AXUIElement] {
    var count: CFIndex = 0; var values: CFArray?
    guard AXUIElementGetAttributeValueCount(element, kAXChildrenAttribute as CFString, &count) == .success,
          count > 0 else { return [] }
    guard AXUIElementCopyAttributeValues(element, kAXChildrenAttribute as CFString, 0, min(count, 64), &values) == .success else { return [] }
    return values as? [AXUIElement] ?? []
}
if !AXIsProcessTrusted() {
    report["status"] = "blocked"; report["reason"] = "Accessibility unavailable; no permission changes attempted"
} else if let windows = attr(app, kAXWindowsAttribute) as? [AXUIElement], windows.count == 1 {
    report["window"] = summary(windows[0])
    if let f = attr(app, kAXFocusedUIElementAttribute), CFGetTypeID(f) == AXUIElementGetTypeID() {
        report["focusBefore"] = summary(f as! AXUIElement)
    }
    var queue: [(AXUIElement, Int)] = [(windows[0], 0)]
    var index = 0; var tables: [[String: Any]] = []; var matches: [AXUIElement] = []
    while index < queue.count && index < 1000 && Date() < deadline {
        let (element, depth) = queue[index]; index += 1
        let role = text(element, kAXRoleAttribute)
        let title = text(element, kAXTitleAttribute); let label = text(element, kAXDescriptionAttribute)
        if action == "click-label" && (title == target || label == target) &&
           ["AXButton", "AXRadioButton", "AXTab"].contains(role) { matches.append(element) }
        if action == "click-cell" && ["AXStaticText", "AXCell"].contains(role) &&
           text(element, kAXValueAttribute).trimmingCharacters(in: .whitespacesAndNewlines) == target { matches.append(element) }
        if role == "AXTable" {
            let rows = attr(element, kAXRowsAttribute) as? [AXUIElement]
            let columns = attr(element, kAXColumnsAttribute) as? [AXUIElement]
            tables.append(["rows": rows?.count ?? 0, "columns": columns?.count ?? 0,
                           "rowEvidenceAvailable": rows != nil, "columnEvidenceAvailable": columns != nil])
        }
        // The synthetic fixture is in our own app, but avoid unbounded editor values.
        if role != "AXTextArea" && depth < 20 { queue.append(contentsOf: children(element).map { ($0, depth+1) }) }
    }
    report["tables"] = tables; report["visited"] = index
    report["bounded"] = Date() >= deadline || index >= 1000
    report["status"] = "observed"
    if action == "click-label" || action == "click-cell" {
        if matches.count == 1, let (p, s) = pointAndSize(matches[0]),
           let application = NSRunningApplication(processIdentifier: pid) {
            application.activate(options: [])
            let center = CGPoint(x: p.x+s.width/2, y: p.y+s.height/2)
            for kind in [CGEventType.leftMouseDown, CGEventType.leftMouseUp] {
                let event = CGEvent(mouseEventSource: nil, mouseType: kind, mouseCursorPosition: center, mouseButton: .left)
                event?.postToPid(pid)
            }
            report["status"] = "input-sent"; report["clicked"] = summary(matches[0])
        } else { report["status"] = "blocked"; report["reason"] = "Expected one visible native labeled control with geometry" }
    } else if action == "chord" {
        let mappings: [String: (CGKeyCode, CGEventFlags)] = [
            "cmd-z": (6, .maskCommand), "cmd-shift-z": (6, [.maskCommand, .maskShift]),
            "cmd-y": (16, .maskCommand), "cmd-s": (1, .maskCommand), "cmd-q": (12, .maskCommand)]
        if let (code, flags) = mappings[target] {
            for down in [true, false] {
                let event = CGEvent(keyboardEventSource: nil, virtualKey: code, keyDown: down)
                event?.flags = flags; event?.postToPid(pid)
            }
            report["status"] = "input-sent"; report["chord"] = target
        } else { report["status"] = "blocked"; report["reason"] = "Unsupported bounded chord" }
    } else if action != "snapshot" { report["status"] = "blocked"; report["reason"] = "Unknown action" }
    if let f = attr(app, kAXFocusedUIElementAttribute), CFGetTypeID(f) == AXUIElementGetTypeID() {
        report["focusAfter"] = summary(f as! AXUIElement)
    }
} else {
    report["status"] = "blocked"; report["reason"] = "Exactly one owned native window required"
}
report["errors"] = errors
let data = try JSONSerialization.data(withJSONObject: report, options: [.sortedKeys])
print(String(data: data, encoding: .utf8)!)
