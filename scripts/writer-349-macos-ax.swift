// Bounded native AX observer/actions for the immutable F Writer package.
// Based on the bounds of runtime-macos-ax.swift at 9a9bfe39; independent helper.
// No JS, TCC change, entitlements change, or document textarea value read.
import ApplicationServices
import CoreGraphics
import Foundation

let pid = pid_t(CommandLine.arguments[1])!
let action = CommandLine.arguments[2]
let target = CommandLine.arguments.count > 3 ? CommandLine.arguments[3] : ""
let deadline = Date().addingTimeInterval(12)
let app = AXUIElementCreateApplication(pid)
AXUIElementSetMessagingTimeout(app, 0.5)
var errors: [String: Int] = [:]
func attribute(_ e: AXUIElement, _ name: String) -> CFTypeRef? {
    if Date() >= deadline { return nil }
    var value: CFTypeRef?
    let result = AXUIElementCopyAttributeValue(e, name as CFString, &value)
    if result != .success { errors[String(result.rawValue), default: 0] += 1 }
    return value
}
func string(_ e: AXUIElement, _ name: String) -> String {
    String((attribute(e, name) as? String ?? "").prefix(600))
}
var report: [String: Any] = ["trusted": AXIsProcessTrusted(), "performed": false, "action": action]
let windows = attribute(app, kAXWindowsAttribute) as? [AXUIElement] ?? []
report["windowTitles"] = windows.map { string($0, kAXTitleAttribute) }
if windows.isEmpty || !AXIsProcessTrusted() {
    report["status"] = "blocked"
    report["reason"] = "Native AX windows unavailable or host did not grant Accessibility trust"
} else {
    var queue: [(AXUIElement, Int)] = windows.map { ($0, 0) }
    var nodes: [[String: Any]] = []
    var languages: [String] = []
    var index = 0
    while index < queue.count && index < 1000 && Date() < deadline {
        let (e, depth) = queue[index]; index += 1
        let role = string(e, kAXRoleAttribute)
        if role == "AXTextArea" {
            if action == "focus-editor" {
                let result = AXUIElementSetAttributeValue(e, kAXFocusedAttribute as CFString, kCFBooleanTrue)
                report["performed"] = result == .success
                report["focusError"] = result.rawValue
                if result == .success { break }
            }
            continue // Never fetch textarea value or contents.
        }
        let title = string(e, kAXTitleAttribute), description = string(e, kAXDescriptionAttribute)
        let subrole = string(e, kAXSubroleAttribute), roleDescription = string(e, kAXRoleDescriptionAttribute)
        var text = ""
        if role == "AXStaticText" || role == "AXTextField" { text = string(e, kAXValueAttribute) }
        let enabled = attribute(e, kAXEnabledAttribute) as? Bool ?? false
        if !title.isEmpty || !description.isEmpty || !text.isEmpty || role == "AXDialog" || role == "AXSheet" || subrole == "AXDialog" {
            nodes.append(["role": role, "subrole": subrole, "roleDescription": roleDescription, "title": title, "description": description, "text": text, "enabled": enabled])
        }
        if role == "AXButton" {
            languages += [title, description].filter { $0.hasPrefix("Language:") }
        }
        // AXPress on a WKWebView radio-tab containing a nested Close button
        // returned success without retaining/activating A in the first probe.
        // Use a real mouse event inside the filename portion, then the caller
        // verifies the actual active document/window title before any typing.
        if action == "tab", role == "AXRadioButton", enabled,
           [title, description].contains(where: { $0.hasPrefix(target) }) {
            if let pv = attribute(e, kAXPositionAttribute), let sv = attribute(e, kAXSizeAttribute),
               CFGetTypeID(pv) == AXValueGetTypeID(), CFGetTypeID(sv) == AXValueGetTypeID() {
                var p = CGPoint.zero; var size = CGSize.zero
                if AXValueGetValue(pv as! AXValue, .cgPoint, &p), AXValueGetValue(sv as! AXValue, .cgSize, &size), size.width > 30, size.height > 5 {
                    let point = CGPoint(x: p.x + min(size.width / 3, 65), y: p.y + size.height / 2)
                    if point.x >= 0 && point.y >= 0 {
                        CGEvent(mouseEventSource: nil, mouseType: .mouseMoved, mouseCursorPosition: point, mouseButton: .left)?.post(tap: .cghidEventTap)
                        CGEvent(mouseEventSource: nil, mouseType: .leftMouseDown, mouseCursorPosition: point, mouseButton: .left)?.post(tap: .cghidEventTap)
                        CGEvent(mouseEventSource: nil, mouseType: .leftMouseUp, mouseCursorPosition: point, mouseButton: .left)?.post(tap: .cghidEventTap)
                        report["performed"] = true
                        report["method"] = "native mouse inside AX tab filename bounds"
                        report["point"] = ["x": point.x, "y": point.y]
                        break
                    }
                }
            }
        }
        if action == "press", !target.isEmpty,
           [title, description].contains(where: { $0.contains(target) }),
           ["AXButton", "AXRadioButton", "AXTab", "AXLink"].contains(role), enabled {
            let result = AXUIElementPerformAction(e, kAXPressAction as CFString)
            report["performed"] = result == .success
            report["pressError"] = result.rawValue
            report["matchedRole"] = role
            report["matchedTitle"] = title
            if result == .success { break }
        }
        if depth < 16 {
            var count: CFIndex = 0; var children: CFArray?
            if AXUIElementGetAttributeValueCount(e, kAXChildrenAttribute as CFString, &count) == .success && count > 0 {
                if AXUIElementCopyAttributeValues(e, kAXChildrenAttribute as CFString, 0, min(count, 64), &children) == .success,
                   let elements = children as? [AXUIElement] {
                    queue += elements.map { ($0, depth + 1) }
                }
            }
        }
    }
    report["status"] = "ok"
    report["nodes"] = nodes
    report["languages"] = languages
    report["visited"] = index
    report["bounded"] = Date() >= deadline || index >= 1000
}
if let focus = attribute(app, kAXFocusedUIElementAttribute), CFGetTypeID(focus) == AXUIElementGetTypeID() {
    report["focusedRole"] = string(focus as! AXUIElement, kAXRoleAttribute)
}
report["errors"] = errors
let data = try JSONSerialization.data(withJSONObject: report, options: [.sortedKeys])
print(String(data: data, encoding: .utf8)!)
