// Native AX client for disposable CI. No TCC grants, JS injection, or test bridge.
// Bound every IPC request and the traversal; never fetch a document text area's value.
import ApplicationServices
import Foundation

let pid = pid_t(CommandLine.arguments[1])!
let labelsURL = URL(fileURLWithPath: CommandLine.arguments[2])
let labels = try JSONSerialization.jsonObject(with: Data(contentsOf: labelsURL)) as! [String: [String]]
let press = CommandLine.arguments[3] == "press"
let deadline = Date().addingTimeInterval(18)
AXUIElementSetMessagingTimeout(AXUIElementCreateSystemWide(), 0.5)
let app = AXUIElementCreateApplication(pid)
var errors: [String: Int] = [:]

func attribute(_ element: AXUIElement, _ name: String) -> CFTypeRef? {
    if Date() >= deadline { return nil }
    var value: CFTypeRef?
    let result = AXUIElementCopyAttributeValue(element, name as CFString, &value)
    if result != .success { errors[String(result.rawValue), default: 0] += 1 }
    return value
}
func string(_ element: AXUIElement, _ name: String) -> String {
    String((attribute(element, name) as? String ?? "").prefix(1500))
}
let display = CGDisplayBounds(CGMainDisplayID())
var report: [String: Any] = ["trusted": AXIsProcessTrusted(), "pressed": false,
    "displayBounds": ["x": Double(display.origin.x), "y": Double(display.origin.y),
        "width": Double(display.width), "height": Double(display.height)]]
let windows = attribute(app, kAXWindowsAttribute) as? [AXUIElement] ?? []
if windows.isEmpty {
    report["status"] = "blocked"
    report["reason"] = "Native AX window inspection failed"
} else {
    report["windowTitle"] = string(windows[0], kAXTitleAttribute)
    var queue: [(AXUIElement, Int)] = [(windows[0], 0)]
    // Save As focuses its filename field. Prefer its dialog ancestor to avoid
    // enumerating the canvas editor behind the modal.
    if !press, let focused = attribute(app, kAXFocusedUIElementAttribute), CFGetTypeID(focused) == AXUIElementGetTypeID() {
        var current = focused as! AXUIElement
        for _ in 0..<16 {
            let role = string(current, kAXRoleAttribute)
            let subrole = string(current, kAXSubroleAttribute)
            if role == "AXDialog" || role == "AXSheet" || subrole == "AXDialog" {
                queue = [(current, 0)]
                break
            }
            guard let parent = attribute(current, kAXParentAttribute), CFGetTypeID(parent) == AXUIElementGetTypeID() else { break }
            current = parent as! AXUIElement
        }
    }
    var texts: [String] = []
    var buttons: [[String: Any]] = []
    var index = 0
    while index < queue.count && index < 800 && Date() < deadline {
        let (element, depth) = queue[index]
        index += 1
        let role = string(element, kAXRoleAttribute)
        if role == "AXTextArea" { continue }
        let title = string(element, kAXTitleAttribute)
        let description = string(element, kAXDescriptionAttribute)
        texts.append(contentsOf: [title, description].filter { !$0.isEmpty })
        if role == "AXStaticText" { texts.append(string(element, kAXValueAttribute)) }
        if role == "AXButton" {
            let enabled = attribute(element, kAXEnabledAttribute) as? Bool ?? false
            buttons.append(["title": title, "description": description, "enabled": enabled])
            let matches = (labels["saveAs"] ?? []).contains { label in
                title == label || description == label || title.hasPrefix(label + " ·") || description.hasPrefix(label + " ·")
            }
            if press && matches && enabled {
                let result = AXUIElementPerformAction(element, kAXPressAction as CFString)
                report["pressed"] = result == .success
                report["pressError"] = result.rawValue
                break
            }
        }
        if depth < 14 {
            // Do not request entire contents or unbounded child arrays.
            var count: CFIndex = 0
            var children: CFArray?
            if AXUIElementGetAttributeValueCount(element, kAXChildrenAttribute as CFString, &count) == .success && count > 0 {
                let result = AXUIElementCopyAttributeValues(element, kAXChildrenAttribute as CFString, 0, min(count, 64), &children)
                if result == .success, let elements = children as? [AXUIElement] {
                    queue.append(contentsOf: elements.map { ($0, depth + 1) })
                }
            }
        }
        if !press && (labels["source"] ?? []).contains(where: { label in texts.contains { $0.contains(label) } }) { break }
    }
    report["status"] = "ok"
    report["texts"] = texts
    report["buttons"] = buttons
    report["visited"] = index
    report["bounded"] = Date() >= deadline || index >= 800
}
report["errors"] = errors
let data = try JSONSerialization.data(withJSONObject: report, options: [.sortedKeys])
print(String(data: data, encoding: .utf8)!)
