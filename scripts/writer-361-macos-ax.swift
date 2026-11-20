// Private helper for proef-writer-361-macos.py. Native AX/CGEvent only.
// No TCC grants, JavaScript injection, app launch or process termination.
import ApplicationServices
import AppKit
import Foundation
import Darwin

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
    if count > 64 { report["childListsTruncated"] = true }
    guard AXUIElementCopyAttributeValues(element, kAXChildrenAttribute as CFString, 0, min(count, 64), &values) == .success else { return [] }
    return values as? [AXUIElement] ?? []
}
func rawAttributes(_ element: AXUIElement, role: String) -> [String: Any] {
    var output: [String: Any] = [:]
    let names = [kAXRoleAttribute, kAXSubroleAttribute, kAXTitleAttribute, kAXDescriptionAttribute,
                 kAXHelpAttribute, kAXIdentifierAttribute, kAXEnabledAttribute, kAXSelectedAttribute,
                 kAXFocusedAttribute, kAXPositionAttribute, kAXSizeAttribute, kAXValueAttribute]
    for name in names {
        if name == kAXValueAttribute && role == "AXTextArea" {
            output[name] = ["status": "omitted", "reason": "Document textarea value is outside ribbon inspection"]
            continue
        }
        if Date() >= deadline { output[name] = ["status": "unavailable", "reason": "bounded deadline"]; continue }
        var value: CFTypeRef?
        let result = AXUIElementCopyAttributeValue(element, name as CFString, &value)
        guard result == .success, let v = value else {
            output[name] = ["status": "unavailable", "axError": result.rawValue]; continue
        }
        if let string = v as? String {
            output[name] = ["status": "available", "value": String(string.prefix(2048)), "truncated": string.count > 2048]
        } else if let number = v as? NSNumber {
            output[name] = ["status": "available", "value": number]
        } else if CFGetTypeID(v) == AXValueGetTypeID() {
            var p = CGPoint.zero; var s = CGSize.zero
            if AXValueGetType(v as! AXValue) == .cgPoint, AXValueGetValue(v as! AXValue, .cgPoint, &p) {
                output[name] = ["status": "available", "value": ["x": p.x, "y": p.y]]
            } else if AXValueGetType(v as! AXValue) == .cgSize, AXValueGetValue(v as! AXValue, .cgSize, &s) {
                output[name] = ["status": "available", "value": ["width": s.width, "height": s.height]]
            } else { output[name] = ["status": "unavailable", "reason": "unsupported AXValue type"] }
        } else { output[name] = ["status": "unavailable", "reason": "unsupported attribute type"] }
    }
    var actions: CFArray?
    let actionResult = AXUIElementCopyActionNames(element, &actions)
    output["actions"] = ["axError": actionResult.rawValue, "value": actions as? [String] ?? []]
    return output
}
if action == "raw-snapshot" {
    // Permission preflight is read-only and never prompts or changes privacy settings.
    report["screenCaptureAuthorized"] = CGPreflightScreenCaptureAccess()
    let mainDisplay = CGMainDisplayID()
    let displayBounds = CGDisplayBounds(mainDisplay)
    report["mainDisplay"] = ["id": mainDisplay, "coordinateSystem": "CG global desktop",
        "bounds": ["X": displayBounds.origin.x, "Y": displayBounds.origin.y,
                   "Width": displayBounds.size.width, "Height": displayBounds.size.height]] as [String: Any]
    let windows = CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as? [[String: Any]] ?? []
    report["ownedScreenWindows"] = windows.filter {
        ($0[kCGWindowOwnerPID as String] as? NSNumber)?.int32Value == pid &&
        ($0[kCGWindowLayer as String] as? NSNumber)?.intValue == 0
    }.map { window in
        ["id": window[kCGWindowNumber as String] ?? NSNull(),
         "bounds": window[kCGWindowBounds as String] ?? NSNull(),
         "title": window[kCGWindowName as String] ?? NSNull(),
         "pid": pid] as [String: Any]
    }
}
if !AXIsProcessTrusted() {
    report["status"] = "blocked"; report["reason"] = "Accessibility unavailable; no permission changes attempted"
} else if let windows = attr(app, kAXWindowsAttribute) as? [AXUIElement], windows.count == 1 {
    report["window"] = summary(windows[0])
    if let f = attr(app, kAXFocusedUIElementAttribute), CFGetTypeID(f) == AXUIElementGetTypeID() {
        report["focusBefore"] = summary(f as! AXUIElement)
    }
    var queue: [(AXUIElement, Int, Int)] = [(windows[0], 0, -1)]
    var index = 0; var tables: [[String: Any]] = []; var matches: [AXUIElement] = []
    var rawNodes: [[String: Any]] = []
    while index < queue.count && index < 1000 && Date() < deadline {
        let (element, depth, parent) = queue[index]; index += 1
        let role = text(element, kAXRoleAttribute)
        let title = text(element, kAXTitleAttribute); let label = text(element, kAXDescriptionAttribute)
        if action == "raw-snapshot" { rawNodes.append(["index": index-1, "parent": parent, "depth": depth, "attributes": rawAttributes(element, role: role)]) }
        if (action == "click-label" || action == "ax-press-label") && (title == target || label == target) &&
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
        if role != "AXTextArea" && depth < 20 { queue.append(contentsOf: children(element).map { ($0, depth+1, index-1) }) }
        else if role != "AXTextArea" { report["depthBoundReached"] = true }
    }
    report["tables"] = tables; report["visited"] = index
    report["bounded"] = Date() >= deadline || index >= 1000
    if action == "raw-snapshot" {
        report["rawNodes"] = rawNodes
        var settable: DarwinBoolean = false
        let result = AXUIElementIsAttributeSettable(windows[0], kAXSizeAttribute as CFString, &settable)
        report["resizeCapability"] = ["axError": result.rawValue, "settableByAX": settable.boolValue,
                                       "verifiedSetterImplemented": false, "resizingAttempted": false]
    }
    report["status"] = "observed"
    if action == "ax-press-label" {
        if matches.count == 1, (attr(matches[0], kAXEnabledAttribute) as? Bool) == true {
            var names: CFArray?
            let available = AXUIElementCopyActionNames(matches[0], &names)
            if available == .success, (names as? [String] ?? []).contains(kAXPressAction) {
                let result = AXUIElementPerformAction(matches[0], kAXPressAction as CFString)
                report["status"] = result == .success ? "input-sent" : "blocked"
                report["pressError"] = result.rawValue; report["pressed"] = summary(matches[0])
            } else { report["status"] = "blocked"; report["reason"] = "Unique control has no native AXPress action" }
        } else { report["status"] = "blocked"; report["reason"] = "Expected one enabled labeled native control" }
    } else if action == "click-label" || action == "click-cell" {
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
    } else if action != "snapshot" && action != "raw-snapshot" { report["status"] = "blocked"; report["reason"] = "Unknown action" }
    if let f = attr(app, kAXFocusedUIElementAttribute), CFGetTypeID(f) == AXUIElementGetTypeID() {
        report["focusAfter"] = summary(f as! AXUIElement)
    }
} else {
    report["status"] = "blocked"; report["reason"] = "Exactly one owned native window required"
}
report["errors"] = errors
let data = try JSONSerialization.data(withJSONObject: report, options: [.sortedKeys])
print(String(data: data, encoding: .utf8)!)
